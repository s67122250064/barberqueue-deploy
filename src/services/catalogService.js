import {get,ref} from 'firebase/database';
import {db,namespace} from '../firebase.js';
import {normalizeCatalog} from './normalize.js';
export const paths={categories:import.meta.env.VITE_CATEGORIES_PATH||'Categories',services:import.meta.env.VITE_SERVICES_PATH||'Services',barbers:import.meta.env.VITE_BARBERS_PATH||'Barbers'};
export const source=import.meta.env.VITE_CATALOG_SOURCE||'firebase';
function deadline(p){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('โหลดข้อมูลเกินเวลา กรุณาตรวจเครือข่ายและ Firebase Rules')),12000)})]).finally(()=>clearTimeout(timer));}
export async function loadCatalog(){
 if(source==='firebase'){
  const entries=await deadline(Promise.all(Object.entries(paths).map(async([key,path])=>[key,(await get(ref(db,path))).val()])));
  return normalizeCatalog(Object.fromEntries(entries));
 }
 if(source==='json'){
  const r=await fetch('/data/Master_Dataset.json');if(!r.ok)throw new Error('โหลด JSON ไม่สำเร็จ');const j=await r.json();return normalizeCatalog({categories:j.Categories,services:j.Services,barbers:j.Barbers});
 }
 if(source==='excel'){
  const XLSX=await import('xlsx');const r=await fetch('/data/Master_Dataset.xlsx');if(!r.ok)throw new Error('โหลด Excel ไม่สำเร็จ');const wb=XLSX.read(await r.arrayBuffer(),{type:'array'});
  return normalizeCatalog(Object.fromEntries(Object.keys(paths).map(k=>[k,XLSX.utils.sheet_to_json(wb.Sheets[{categories:'Categories',services:'Services',barbers:'Barbers'}[k]],{header:1,defval:''})])));
 }
 throw new Error('VITE_CATALOG_SOURCE ต้องเป็น firebase, json หรือ excel');
}
export async function loadSettings(){return (await deadline(get(ref(db,namespace+'/settings')))).val();}
