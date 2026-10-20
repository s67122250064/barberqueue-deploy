export const A='/assets/';
export const money=n=>`฿${Number(n||0).toLocaleString('th-TH')}`;
export const serviceImg=s=>`${A}images/Services/svc_${String(Number(String(s.service_id).match(/\d+/)?.[0]||1)).padStart(3,'0')}_thumb.webp`;
export const barberImg=b=>`${A}images/Barber/barber_${String(Number(String(b.barber_id).match(/\d+/)?.[0]||1)).padStart(3,'0')}_avatar.webp`;
export const iconFor=c=>`${A}icons/${String(c.icon_file||'').replace(/\.svg$/,'')}.svg.svg`;
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#ede8df"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#777">BarberQueue</text></svg>');
export function imageFallback(remote){return e=>{const img=e.currentTarget;if(img.dataset.fallback==='1'){img.onerror=null;img.src=placeholder;return;}img.dataset.fallback='1';img.src=typeof remote==='string'&&/^https:\/\//.test(remote)?remote:placeholder;};}
export function errorText(e){const code=String(e?.code||'');if(code.includes('permission'))return 'ไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาตรวจบัญชีและ Firebase Rules';if(/invalid-credential|user-not-found|wrong-password/.test(code))return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';if(code.includes('email-already-in-use'))return 'อีเมลนี้มีบัญชีแล้ว';if(code.includes('operation-not-allowed'))return 'ยังไม่ได้เปิด Email/Password ใน Firebase Authentication';if(/network|unavailable|internal/.test(code))return 'เชื่อมต่อบริการไม่สำเร็จ กรุณาลองใหม่ หรือตรวจการตั้งค่า Firebase';return e?.message||'ดำเนินการไม่สำเร็จ';}
export const displayDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?d.split('-').reverse().join('/'):d;
