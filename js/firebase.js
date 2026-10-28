import{initializeApp}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import{initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,collection,setDoc,getDoc,updateDoc,addDoc,deleteDoc,onSnapshot,query,orderBy}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import{getAuth,signInAnonymously}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// Paste your Firebase web app config here (Project settings > Your apps). It is safe to publish; your security rules protect the data.
const firebaseConfig = {
  apiKey: "AIzaSyC3SM2H8GIdBy1Qeqbl5YGKE_yXsmshsVc",
  authDomain: "splitable-e6b18.firebaseapp.com",
  projectId: "splitable-e6b18",
  storageBucket: "splitable-e6b18.firebasestorage.app",
  messagingSenderId: "915320395669",
  appId: "1:915320395669:web:bf9921ca36f7b52330489c"
};

const app=initializeApp(firebaseConfig);
// Offline cache: writes made without internet are stored on the device and sent automatically when you reconnect.
const db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()}),ignoreUndefinedProperties:true});
const auth=getAuth(app);
export const authReady=(async()=>{try{await auth.authStateReady();if(!auth.currentUser)await signInAnonymously(auth)}catch{}})();

const uid=()=>'m'+Math.random().toString(36).slice(2,9);
const G=code=>doc(db,'groups',code);

// Writes are deliberately not awaited: offline they stay pending until the server confirms.
export function createGroup({name,type,me}){
  const code=String(Math.floor(100000+Math.random()*900000)),id=uid();
  setDoc(G(code),{name,type,round:false,created:Date.now(),members:{[id]:{name:me,host:true}}});
  return{code,me:id};
}
export async function joinGroup(code,name){
  await authReady;
  const s=await getDoc(G(code));if(!s.exists())throw new Error('nogroup');
  const d=s.data(),hit=Object.entries(d.members).find(([,m])=>m.name.toLowerCase()===name.toLowerCase());
  if(hit)return{me:hit[0],name:d.name}; // same name reuses the profile, which is how a guest claims theirs
  const id=uid();updateDoc(G(code),{[`members.${id}`]:{name}});return{me:id,name:d.name};
}
export const addGuest=(code,name)=>updateDoc(G(code),{[`members.${uid()}`]:{name,guest:true}});
export const setRound=(code,v)=>updateDoc(G(code),{round:v});
export function saveReceipt(code,{id,...data}){const col=collection(G(code),'receipts'),r=id?doc(col,id):doc(col);setDoc(r,data);return r.id}
export const delReceipt=(code,id)=>deleteDoc(doc(G(code),'receipts',id));
export const recordPayment=(code,p)=>addDoc(collection(G(code),'payments'),{...p,ts:Date.now()});
export function watch(code,h){
  let u=[],dead=false;
  authReady.then(()=>{if(dead)return;const g=G(code),L=s=>s.docs.map(d=>({id:d.id,...d.data()}));
    u=[onSnapshot(g,s=>h.onGroup(s.exists()?s.data():null)),
       onSnapshot(query(collection(g,'receipts'),orderBy('ts','desc')),s=>h.onReceipts(L(s))),
       onSnapshot(collection(g,'payments'),s=>h.onPayments(L(s)))]});
  return()=>{dead=true;u.forEach(f=>f())};
}

// Payment QR lives in Firestore as a small compressed image (no Firebase Storage needed).
export const saveQR=(code,id,img)=>setDoc(doc(G(code),'qr',id),{img});
export async function getQR(code,id){await authReady;const s=await getDoc(doc(G(code),'qr',id));return s.exists()?s.data().img:null}
