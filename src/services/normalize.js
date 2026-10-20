const ids={categories:'category_id',services:'service_id',barbers:'barber_id'};
export function cleanRows(rows){
 const i=rows.findIndex(r=>Array.isArray(r)&&r.some(v=>['category_id','service_id','barber_id'].includes(String(v).trim())));
 if(i<0)return [];
 const headers=rows[i].map(x=>String(x??'').trim());
 return rows.slice(i+1).filter(r=>r.some(v=>v!==null&&v!==undefined&&v!=='')).map(r=>Object.fromEntries(headers.filter(Boolean).map(h=>[h,r[headers.indexOf(h)]??''])));
}
export function normalizeRecords(value,kind){
 const id=ids[kind];if(!id)throw new Error('Unknown catalog kind');
 if(value===null||value===undefined)return [];
 let rows;
 if(Array.isArray(value))rows=value.length&&Array.isArray(value[0])?cleanRows(value):value;
 else if(typeof value==='object')rows=Object.entries(value).map(([key,item])=>item&&typeof item==='object'?{[id]:key,...item}:null);
 else throw new Error('รูปแบบข้อมูล '+kind+' ไม่ถูกต้อง');
 rows=rows.filter(x=>x&&typeof x==='object');
 // Older worksheet-export JSON stores header names inside object values.
 if(rows.length&&!rows.some(x=>x[id]))rows=cleanRows(rows.map(x=>Object.values(x)));
 const seen=new Set();return rows.map(x=>{
  const out={...x,[id]:String(x[id]??'').trim()};
  if(!out[id]||out[id]===id||/[.#$\[\]\/]/.test(out[id])||seen.has(out[id]))throw new Error('รหัสข้อมูล '+kind+' ไม่ถูกต้องหรือซ้ำ');
  seen.add(out[id]);
  if(kind==='services'){out.service_name=x.service_name??x.name;out.image_thumb_url=x.image_thumb_url??x.image_url??'';out.price=Number(x.price);out.duration_min=Number(x.duration_min);if(!out.service_name||!Number.isFinite(out.price)||out.price<0||!Number.isInteger(out.duration_min)||out.duration_min<=0)throw new Error('ข้อมูลบริการไม่ครบ: '+out[id]);}
  if(kind==='barbers'){out.full_name=x.full_name??x.name;out.experience_yrs=Number(x.experience_yrs??x.experience_years??0);out.image_avatar_url=x.image_avatar_url??x.image_url??'';if(!out.full_name)throw new Error('ข้อมูลช่างไม่ครบ');}
  if(kind==='categories'){out.category_name_th=x.category_name_th??x.name;if(!out.category_name_th)throw new Error('ข้อมูลหมวดหมู่ไม่ครบ');}
  return out;
 });
}
export function normalizeCatalog(raw){
 const out={};for(const k of Object.keys(ids))out[k]=normalizeRecords(raw[k],k);
 const cats=new Set(out.categories.map(c=>c.category_id));
 if(out.services.some(s=>!cats.has(s.category_id)))throw new Error('บริการอ้างอิงหมวดหมู่ที่ไม่มีอยู่');
 return out;
}
