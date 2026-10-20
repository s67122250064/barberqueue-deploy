import {httpsCallable} from 'firebase/functions';
import {functions,auth} from '../firebase.js';
export const call=async(name,data={})=>{
 if((import.meta.env.VITE_CATALOG_SOURCE||'firebase')!=='firebase'&&['createBooking','confirmBookingPayment','changeBookingStatus','saveCatalogItem','setUserRole'].includes(name))throw new Error('การเขียนข้อมูลถูกปิดในโหมดตรวจไฟล์ตัวอย่าง');
 const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
 if(!base)return (await httpsCallable(functions,name,{timeout:20000})(data)).data;
 if(import.meta.env.VITE_USE_EMULATORS==='true')throw new Error('กรุณาปิด Emulator ก่อนใช้ API ออนไลน์');
 if(!base.startsWith('https://'))throw new Error('API ต้องใช้ HTTPS');
 if(!auth.currentUser)throw new Error('กรุณาเข้าสู่ระบบ');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
 try{
  const token=await auth.currentUser.getIdToken();
  const response=await fetch(`${base}/api/${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(data),signal:controller.signal});
  const result=await response.json();
  if(!response.ok||result.error){const e=new Error(result.error?.message||'ดำเนินการไม่สำเร็จ');e.code=result.error?.code;throw e;}
  return result.data;
 }catch(e){if(e.name==='AbortError')throw new Error('เซิร์ฟเวอร์ยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่');throw e;}finally{clearTimeout(timer);}
};
