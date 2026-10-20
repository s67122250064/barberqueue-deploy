import {initializeApp} from "firebase/app";
import {getDatabase,connectDatabaseEmulator} from "firebase/database";
import {getAuth,connectAuthEmulator} from "firebase/auth";
import {getFunctions,connectFunctionsEmulator} from "firebase/functions";
const firebaseConfig = {
  apiKey: "AIzaSyARVipl3NWPTrjtCZoDzeEVtLm9bQLnPvY",
  authDomain: "salon-booking-7881d.firebaseapp.com",
  databaseURL: "https://salon-booking-7881d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "salon-booking-7881d",
  storageBucket: "salon-booking-7881d.firebasestorage.app",
  messagingSenderId: "364439642362",
  appId: "1:364439642362:web:a6748c73beb4cacb786943"
};


const emulator = import.meta.env.VITE_USE_EMULATORS === "true";
// Emulator runs never use the production project or database.
const config = emulator ? {apiKey:"demo-key",projectId:"demo-barberqueue",authDomain:"localhost",databaseURL:"https://demo-barberqueue-default-rtdb.firebaseio.com"} : firebaseConfig;
export const app=initializeApp(config);
export const db=getDatabase(app,config.databaseURL);
export const auth=getAuth(app);
export const functions=getFunctions(app,"asia-southeast1");
if(emulator){
 connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
 connectDatabaseEmulator(db,"127.0.0.1",9000);
 connectFunctionsEmulator(functions,"127.0.0.1",5001);
}
export const namespace="barberQueueV2";
