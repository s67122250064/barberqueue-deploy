export class DomainError extends Error{constructor(message,code='invalid-argument'){super(message);this.code=code;}}
const fail=(message,code)=>{throw new DomainError(message,code);};
export function minutes(t){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t||''))fail('เวลาต้องอยู่ในรูป HH:mm');return Number(t.slice(0,2))*60+Number(t.slice(3));}
export const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function dateValid(d){const t=new Date(d+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===d;}
export function epoch(d,t){if(!dateValid(d))fail('วันที่ไม่ถูกต้อง');minutes(t);return Date.parse(`${d}T${t}:00+07:00`);}
export function policy(settings){if(settings?.confirmed!==true)fail('ยังไม่ได้ยืนยันเวลาร้าน','failed-precondition');const open=minutes(settings.open_time),close=minutes(settings.close_time);if(close<=open)fail('เวลาปิดต้องอยู่หลังเวลาเปิด');const step=Number(settings.slot_step_min);if(!Number.isInteger(step)||step<5||step>120)fail('ต้องยืนยันระยะห่างเวลาจอง');if(!Number.isInteger(settings.cancel_before_min)||settings.cancel_before_min<0)fail('ต้องยืนยันเวลายกเลิกล่วงหน้า');const days=settings.open_days;if(!Array.isArray(days)||!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(days).size!==days.length)fail('ต้องยืนยันวันเปิดร้าน');return {open,close,step,days};}
export function slots({settings,duration,date,entries=[],now=Date.now()}){const {open,close,step,days}=policy(settings);if(!dateValid(date))fail('วันที่ไม่ถูกต้อง');if(!days.includes(new Date(date+'T12:00:00+07:00').getUTCDay()))return [];if(!Number.isInteger(duration)||duration<1||duration>720)fail('ระยะเวลาบริการไม่ถูกต้อง');const out=[];for(let start=open;start+duration<=close;start+=step){if(epoch(date,clock(start))<=now)continue;if(entries.some(b=>b.status!=='cancelled'&&start<b.end&&start+duration>b.start))continue;out.push(clock(start));}return out;}
export function bookingInput(input={}){if(!dateValid(input.date))fail('วันที่ไม่ถูกต้อง');minutes(input.time);for(const k of ['request_id','service_id','barber_id'])if(!/^[A-Za-z0-9_-]{1,100}$/.test(input[k]||''))fail('รหัสไม่ถูกต้อง');if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>100)fail('กรุณากรอกชื่อ');if(!/^0\d{8,9}$/.test(input.phone||''))fail('เบอร์โทรไม่ถูกต้อง');if(!['cash','qr'].includes(input.payment_method))fail('กรุณาเลือกเงินสดหรือ QR Code');return {...input,name:input.name.trim()};}
export function reserve(state,booking,settings,now=Date.now()){
 const next=structuredClone(state||{});next.byUser??={};next.days??={};
 const old=next.byUser[booking.user_id]?.[booking.id];
 if(old){if(['service_id','barber_id','date','time','name','phone','payment_method'].some(k=>old[k]!==booking[k]))fail('รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว','already-exists');return next;}
 const entries=Object.values(next.days[booking.date]?.[booking.barber_id]||{});
 if(!slots({settings,duration:booking.duration_min,date:booking.date,entries,now}).includes(booking.time))fail('ช่วงเวลานี้ไม่ว่างหรือเลยเวลาจองแล้ว','already-exists');
 next.byUser[booking.user_id]??={};next.byUser[booking.user_id][booking.id]=booking;
 next.days[booking.date]??={};next.days[booking.date][booking.barber_id]??={};
 next.days[booking.date][booking.barber_id][booking.id]={start:minutes(booking.time),end:minutes(booking.time)+booking.duration_min,status:'confirmed'};
 return next;
}
// Shared with the frontend: server-side roles remain authoritative.
export function bookingCapabilities(b,actor,now=Date.now()){
 const admin=actor?.role==='admin';
 const assigned=actor?.role==='barber'&&!!actor.barber_id&&actor.barber_id===b.barber_id;
 const owner=actor?.role==='customer'&&actor.uid===b.user_id;
 const active=['confirmed','in_progress'].includes(b.status);
 const started=active&&epoch(b.date,b.time)<=now;
 return {
  cancel:admin&&active||owner&&canCustomerCancel(b,now),
  start:admin&&b.status==='confirmed'&&started,
  complete:(admin||assigned)&&active&&started
 };
}
export function transition(state,{owner,id,status,actor,now=Date.now()}){
 const next=structuredClone(state||{});const b=next.byUser?.[owner]?.[id];if(!b)fail('ไม่พบรายการจอง','not-found');
 const admin=actor.role==='admin';
 const assigned=actor.role==='barber'&&!!actor.barber_id&&actor.barber_id===b.barber_id;
 const customer=actor.role==='customer'&&actor.uid===owner;
 if(actor.role==='barber'&&(!assigned||status!=='completed'))fail('ช่างเปลี่ยนได้เฉพาะตัดเสร็จแล้วสำหรับคิวของตนเอง','permission-denied');
 if(!admin&&!assigned&&!customer)fail('ไม่มีสิทธิ์แก้รายการนี้','permission-denied');
 if(customer&&status!=='cancelled')fail('ลูกค้าเปลี่ยนได้เฉพาะการยกเลิกคิว','permission-denied');
 if(status===b.status)return next;
 const permissions=bookingCapabilities(b,actor,now);
 const allowed={cancelled:permissions.cancel,in_progress:permissions.start,completed:permissions.complete};
 if(!allowed[status]){
  if(customer&&status==='cancelled'&&b.status==='confirmed')fail('ยกเลิกได้ก่อนเวลานัดอย่างน้อย '+(b.cancel_before_min??60)+' นาที','failed-precondition');
  if(['in_progress','completed'].includes(status)&&['confirmed','in_progress'].includes(b.status)&&epoch(b.date,b.time)>now)fail('ยังไม่ถึงเวลาเริ่มบริการ','failed-precondition');
  fail('ไม่สามารถเปลี่ยนสถานะนี้ได้','failed-precondition');
 }
 b.status=status;b.updated_at=now;
 const day=next.days?.[b.date]?.[b.barber_id]?.[id];if(day)day.status=status;
 return next;
}

export function paymentDetails(method,settings){
 if(method==='cash')return {payment_method:'cash',payment_status:'unpaid'};
 if(method!=='qr')fail('วิธีชำระเงินไม่ถูกต้อง');
 const url=settings.payment_qr_image_url,recipient=settings.payment_recipient;
 if(typeof url!=='string'||!(/^https:\/\//.test(url)||/^\/(?!\/)/.test(url))||typeof recipient!=='string'||!recipient.trim())fail('ร้านยังไม่ได้ตั้งค่า QR รับเงิน','failed-precondition');
 return {payment_method:'qr',payment_status:'unpaid',payment_qr_image_url:url,payment_recipient:recipient.trim()};
}
export function confirmPayment(state,{owner,id,actor,now=Date.now()}){
 if(actor.role!=='admin')fail('เฉพาะผู้ดูแลที่ยืนยันการรับเงินได้','permission-denied');
 const next=structuredClone(state||{}),b=next.byUser?.[owner]?.[id];
 if(!b)fail('ไม่พบรายการจอง','not-found');
 if(b.payment_status==='paid')return next;
 if(b.status==='cancelled')fail('ไม่สามารถรับชำระรายการที่ยกเลิกแล้ว','failed-precondition');
 if(!['cash','qr'].includes(b.payment_method))fail('ไม่พบวิธีชำระเงินที่ถูกต้อง','failed-precondition');
 b.payment_status='paid';b.paid_at=now;b.paid_by=actor.uid;b.updated_at=now;
 return next;
}

export function cancellationDeadline(booking){
 const lead=booking.cancel_before_min??60;
 if(!Number.isInteger(lead)||lead<0)fail('นโยบายยกเลิกไม่ถูกต้อง','failed-precondition');
 return epoch(booking.date,booking.time)-lead*60000;
}
export function canCustomerCancel(booking,now=Date.now()){
 return booking.status==='confirmed'&&now<=cancellationDeadline(booking);
}
