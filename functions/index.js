import {initializeApp,cert} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {getAuth} from 'firebase-admin/auth';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {DomainError,bookingInput,reserve,transition,slots,policy,dateValid,paymentDetails,confirmPayment} from './domain.js';
// Match the web client namespace during demo Emulator runs. CLI defaults can
// otherwise select demo-barberqueue while the client uses demo-barberqueue-default-rtdb.
initializeApp(process.env.FUNCTIONS_EMULATOR === 'true' ? {
 projectId: 'demo-barberqueue',
 databaseURL: 'https://demo-barberqueue-default-rtdb.firebaseio.com'
} : process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? {
 credential:cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
 projectId:process.env.FIREBASE_PROJECT_ID,
 databaseURL:process.env.FIREBASE_DATABASE_URL
} : undefined);
const db=getDatabase();const NS='barberQueueV2';
const catalogPaths={services:process.env.CATALOG_SERVICES_PATH||'Services',categories:process.env.CATALOG_CATEGORIES_PATH||'Categories',barbers:process.env.CATALOG_BARBERS_PATH||'Barbers'};
// Transaction callbacks may receive null before the SDK has loaded server state.
// Return null to negotiate with the server; distinguish a genuinely missing node after commit.
async function atomic(path,update,allowEmpty=false){
 let failure,applied=false;
 const tx=await db.ref(path).transaction(state=>{
  failure=undefined;applied=false;
  if(state===null&&!allowEmpty)return null;
  try{const value=update(state);applied=true;return value;}catch(e){failure=e;return undefined;}
 },undefined,false);
 if(failure)throw failure;
 if(!applied)throw new HttpsError('not-found','ไม่พบข้อมูลที่ต้องการแก้ไข');
 if(!tx.committed)throw new HttpsError('aborted','บันทึกไม่สำเร็จ กรุณาลองใหม่');
 return tx;
}
function callable(handler){return onCall({region:'asia-southeast1',maxInstances:3,timeoutSeconds:30},async req=>{if(!req.auth)throw new HttpsError('unauthenticated','กรุณาเข้าสู่ระบบ');try{return await handler(req);}catch(e){if(e instanceof HttpsError)throw e;if(e instanceof DomainError)throw new HttpsError(e.code,e.message);console.error('Operation failed',{code:e.code||'unknown'});throw new HttpsError('internal','ดำเนินการไม่สำเร็จ กรุณาตรวจบริการฝั่งเซิร์ฟเวอร์');}});}
async function actor(req){
 const record=(await db.ref(`${NS}/roles/${req.auth.uid}`).get()).val();
 const role=record?.role??'customer';
 if(!['customer','barber','admin'].includes(role))throw new HttpsError('permission-denied','สิทธิ์ผู้ใช้ไม่ถูกต้อง');
 if(role==='barber'&&(typeof record.barber_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(record.barber_id)))throw new HttpsError('permission-denied','บัญชีช่างยังไม่ได้ผูกกับรหัสช่าง');
 return {uid:req.auth.uid,role,...(role==='barber'?{barber_id:record.barber_id}:{})};
}
async function admin(req){const a=await actor(req);if(a.role!=='admin')throw new HttpsError('permission-denied','เฉพาะผู้ดูแลระบบ');return a;}
const readSettings=async()=>{const s=(await db.ref(NS+'/settings').get()).val();policy(s);return s;};
const list=value=>Array.isArray(value)?value.filter(Boolean):Object.values(value||{});
async function item(kind,id){const rows=list((await db.ref(catalogPaths[kind]).get()).val());return rows.find(x=>x?.[{services:'service_id',barbers:'barber_id',categories:'category_id'}[kind]]===id);}
function assertId(id){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new HttpsError('invalid-argument','รหัสไม่ถูกต้อง');}
export const getAvailability=callable(async req=>{const d=req.data;assertId(d.service_id);assertId(d.barber_id);if(!dateValid(d.date))throw new HttpsError('invalid-argument','วันที่ไม่ถูกต้อง');const [service,barber,settings]=await Promise.all([item('services',d.service_id),item('barbers',d.barber_id),readSettings()]);if(!service||!barber||service.active===false||barber.active===false)throw new HttpsError('not-found','บริการหรือช่างไม่พร้อมใช้งาน');const entries=list((await db.ref(`${NS}/bookingState/days/${d.date}/${d.barber_id}`).get()).val());return {slots:slots({settings,duration:Number(service.duration_min),date:d.date,entries})};});
export const createBooking=callable(async req=>{const a=await actor(req);if(a.role==='barber')throw new HttpsError('permission-denied','บัญชีช่างใช้ดูตารางและกดตัดเสร็จแล้วเท่านั้น');const d=bookingInput(req.data);const [service,barber,settings]=await Promise.all([item('services',d.service_id),item('barbers',d.barber_id),readSettings()]);if(!service||!barber||service.active===false||barber.active===false)throw new HttpsError('not-found','บริการหรือช่างไม่พร้อมใช้งาน');const price=Number(service.price),duration=Number(service.duration_min);if(!Number.isFinite(price)||price<0)throw new HttpsError('failed-precondition','ราคาบริการไม่ถูกต้อง');const b={id:d.request_id,user_id:req.auth.uid,service_id:d.service_id,barber_id:d.barber_id,date:d.date,time:d.time,name:d.name,phone:d.phone,service_name:service.service_name||service.name,barber_name:barber.full_name||barber.name,price,duration_min:duration,cancel_before_min:settings.cancel_before_min,...paymentDetails(d.payment_method,settings),status:'confirmed',created_at:Date.now()};
 const tx=await atomic(NS+'/bookingState',state=>reserve(state,b,settings),true);if(!tx.committed)throw new HttpsError('aborted','บันทึกไม่สำเร็จ กรุณาลองใหม่');return {id:b.id};});
export const changeBookingStatus=callable(async req=>{const a=await actor(req);const d=req.data;assertId(d.id);assertId(d.owner_uid);await atomic(NS+'/bookingState',state=>transition(state,{owner:d.owner_uid,id:d.id,status:d.status,actor:a}));return {ok:true};});
export const listBookings=callable(async req=>{const a=await actor(req);const staff=req.data?.staff===true;if(a.role==='barber'&&!staff)throw new HttpsError('permission-denied','บัญชีช่างดูได้เฉพาะตารางของตนเอง');if(staff&&!['admin','barber'].includes(a.role))throw new HttpsError('permission-denied','ไม่มีสิทธิ์ดูตารางงาน');if(req.data?.date&&!dateValid(req.data.date))throw new HttpsError('invalid-argument','วันที่ไม่ถูกต้อง');const rows=staff?Object.values((await db.ref(NS+'/bookingState/byUser').get()).val()||{}).flatMap(list):list((await db.ref(`${NS}/bookingState/byUser/${a.uid}`).get()).val());return rows.filter(b=>(!staff||a.role==='admin'||b.barber_id===a.barber_id)&&(!req.data?.date||b.date===req.data.date)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));});
export const adminUsers=callable(async req=>{await admin(req);const [users,roles]=await Promise.all([db.ref(NS+'/users').get(),db.ref(NS+'/roles').get()]);return Object.entries(users.val()||{}).map(([uid,u])=>({uid,...u,...(roles.val()?.[uid]||{role:'customer'})}));});
export const setUserRole=callable(async req=>{const a=await admin(req);const d=req.data;assertId(d.uid);if(!['customer','barber','admin'].includes(d.role))throw new HttpsError('invalid-argument','สิทธิ์ไม่ถูกต้อง');if(d.uid===a.uid)throw new HttpsError('failed-precondition','ให้ผู้ดูแลอื่นเปลี่ยนสิทธิ์ของคุณเพื่อป้องกันสูญเสียผู้ดูแล');await getAuth().getUser(d.uid);if(d.role==='barber')assertId(d.barber_id);if(d.role==='barber'&&!await item('barbers',d.barber_id))throw new HttpsError('invalid-argument','ไม่พบช่าง');await db.ref(NS+'/roles/'+d.uid).set({role:d.role,...(d.role==='barber'?{barber_id:d.barber_id}:{})});return {ok:true};});
export const saveCatalogItem=callable(async req=>{await admin(req);const {kind,item:record,create}=req.data;const field={services:'service_id',barbers:'barber_id',categories:'category_id'}[kind];if(!field||!record||typeof record!=='object'||Array.isArray(record))throw new HttpsError('invalid-argument','ข้อมูลไม่ถูกต้อง');assertId(record[field]);
 const name=record[{services:'service_name',barbers:'full_name',categories:'category_name_th'}[kind]];if(typeof name!=='string'||!name.trim()||name.length>150)throw new HttpsError('invalid-argument','ต้องระบุชื่อ');
 if(kind==='services'){if(typeof record.price!=='number'||!Number.isFinite(record.price)||record.price<0||!Number.isInteger(record.duration_min)||record.duration_min<1||record.duration_min>720||!await item('categories',record.category_id))throw new HttpsError('invalid-argument','ราคา ระยะเวลา หรือหมวดหมู่ไม่ถูกต้อง');}
 // Existing Firebase uses numeric keys; find and preserve them. Never overwrite an entire catalog node.
 await atomic(catalogPaths[kind],current=>{const obj=current||{};const key=Object.keys(obj).find(k=>obj[k]?.[field]===record[field]);if(create&&key!==undefined)throw new HttpsError('already-exists','รหัสนี้มีอยู่แล้ว');if(!create&&key===undefined)throw new HttpsError('not-found','ไม่พบรายการเดิม');return {...obj,[key??record[field]]:{...(key!==undefined?obj[key]:{}),...record}};},create===true);return {ok:true};});

export const confirmBookingPayment=callable(async req=>{
 const a=await admin(req),d=req.data||{};assertId(d.id);assertId(d.owner_uid);
 await atomic(NS+'/bookingState',state=>confirmPayment(state,{owner:d.owner_uid,id:d.id,actor:a}));
 return {ok:true};
});
