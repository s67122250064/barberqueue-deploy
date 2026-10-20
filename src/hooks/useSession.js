import {useEffect,useState} from 'react';
import {onAuthStateChanged,signOut,signInWithEmailAndPassword,createUserWithEmailAndPassword,updateProfile} from 'firebase/auth';
import {onValue,ref,set} from 'firebase/database';
import {auth,db,namespace} from '../firebase.js';
export function useSession(){
 const [session,setSession]=useState({user:null,role:'guest',loading:true,error:''});
 useEffect(()=>{
  let generation=0,stopRole=()=>{},timer;
  const stop=onAuthStateChanged(auth,user=>{
   const ticket=++generation;stopRole();clearTimeout(timer);
   if(!user){setSession({user:null,role:'guest',loading:false,error:''});return;}
   setSession({user,role:'customer',barber_id:'',loading:true,error:''});
   const failed=()=>{if(ticket===generation)setSession({user,role:'customer',barber_id:'',loading:false,error:'ตรวจสิทธิ์เพิ่มเติมไม่ได้ กรุณาตรวจ Rules; ระบบจะไม่ให้สิทธิ์ช่างหรือ Admin'});};
   timer=setTimeout(failed,12000);
   stopRole=onValue(ref(db,namespace+'/roles/'+user.uid),snapshot=>{
    clearTimeout(timer);if(ticket!==generation)return;
    const record=snapshot.val(),role=record?.role??'customer';
    if(!['customer','barber','admin'].includes(role)||role==='barber'&&(typeof record.barber_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(record.barber_id))){failed();return;}
    setSession({user,role,barber_id:role==='barber'?record.barber_id:'',loading:false,error:''});
   },()=>{clearTimeout(timer);failed();});
  });
  return()=>{generation++;clearTimeout(timer);stopRole();stop();};
 },[]);
 return {...session,logout:()=>signOut(auth)};
}
export async function login(email,password){return signInWithEmailAndPassword(auth,email.trim(),password);}
export async function register(name,email,password){
 const {user}=await createUserWithEmailAndPassword(auth,email.trim(),password);
 await updateProfile(user,{displayName:name.trim()});
 // Authentication is authoritative; a failed profile write must not pretend account creation failed.
 let warning='';try{await saveProfile(user,{name:name.trim(),phone:''});}catch{warning='สร้างบัญชีแล้ว แต่บันทึกโปรไฟล์ไม่ได้ กรุณาตรวจ Rules และบันทึกอีกครั้งที่โปรไฟล์';}
 return {user,warning};
}
export async function saveProfile(user,{name,phone}){await set(ref(db,namespace+'/users/'+user.uid),{name:name.trim(),phone:phone.trim(),email:user.email});await updateProfile(user,{displayName:name.trim()});}
