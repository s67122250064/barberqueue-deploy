import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';

const names=new Set(['getAvailability','createBooking','changeBookingStatus','listBookings','adminUsers','setUserRole','saveCatalogItem','confirmBookingPayment']);
const status={unauthenticated:401,'permission-denied':403,'not-found':404,'invalid-argument':400,'failed-precondition':409,'already-exists':409,aborted:409};
export function apiServer({handlers,verifyToken,origins}){
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const origin=req.headers.origin;
  if(origin&&!origins.includes(origin))return reply(403,{error:{code:'permission-denied',message:'Origin is not allowed'}});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true});
  const name=req.url?.match(/^\/api\/([A-Za-z]+)$/)?.[1];
  if(!names.has(name))return reply(404,{error:{code:'not-found',message:'Not found'}});
  if(req.method!=='POST')return reply(405,{error:{code:'invalid-argument',message:'Use POST'}});
  try{
   const bearer=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
   if(!bearer)return reply(401,{error:{code:'unauthenticated',message:'กรุณาเข้าสู่ระบบ'}});
   let token;
   try{token=await verifyToken(bearer);}catch{return reply(401,{error:{code:'unauthenticated',message:'กรุณาเข้าสู่ระบบใหม่'}});}
   if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:{code:'invalid-argument',message:'Use application/json'}});
   let body='',size=0;
   for await(const chunk of req){size+=chunk.length;if(size>65536)return reply(413,{error:{code:'invalid-argument',message:'Request too large'}});body+=chunk;}
   let data;try{data=JSON.parse(body);}catch{return reply(400,{error:{code:'invalid-argument',message:'Invalid JSON'}});}
   if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,{error:{code:'invalid-argument',message:'Expected object'}});
   const result=await handlers[name].run({data,auth:{uid:token.uid,token}});
   return reply(200,{data:result});
  }catch(e){const code=status[e.code]?e.code:'internal';return reply(status[code]||500,{error:{code,message:code==='internal'?'ดำเนินการไม่สำเร็จ กรุณาลองใหม่':e.message}});}
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIREBASE_DATABASE_EMULATOR_HOST||process.env.FUNCTIONS_EMULATOR)throw new Error('Render server must use real Firebase');
 for(const key of ['FIREBASE_SERVICE_ACCOUNT_JSON','FIREBASE_PROJECT_ID','FIREBASE_DATABASE_URL','ALLOWED_ORIGINS'])if(!process.env[key])throw new Error('Missing setting: '+key);
 const account=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
 if(account.project_id!==process.env.FIREBASE_PROJECT_ID)throw new Error('Service account project mismatch');
 const origins=process.env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).filter(Boolean);
 for(const origin of origins){const u=new URL(origin);if(u.origin!==origin||u.protocol!=='https:')throw new Error('Use exact HTTPS origins');}
 const handlers=await import('./index.js');
 const {getAuth}=await import('firebase-admin/auth');
 const server=apiServer({handlers,verifyToken:t=>getAuth().verifyIdToken(t,true),origins});
 server.requestTimeout=30000;
 server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('BarberQueue API ready'));
}
