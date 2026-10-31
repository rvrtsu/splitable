import{initializeApp}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import{initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,collection,setDoc,getDoc,getDocFromServer,updateDoc,addDoc,deleteDoc,deleteField,onSnapshot,query,orderBy,limit,writeBatch,arrayUnion,arrayRemove}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import{getAuth,signInAnonymously}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import{firebaseConfig}from'./firebase-config.js';
import{guestId}from'./logic.js';

const app=initializeApp(firebaseConfig);
// Offline cache: writes made without internet are stored on the device and sent automatically when you reconnect.
const db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()}),ignoreUndefinedProperties:true});
const auth=getAuth(app);
// Anonymous sign-in only proves "this is a real copy of the app". Identity is the account code, not this session.
export const authReady=(async()=>{try{await auth.authStateReady();if(!auth.currentUser)await signInAnonymously(auth)}catch{}})();

const G=code=>doc(db,'groups',code),U=code=>doc(db,'users',code),R=(code,id)=>doc(collection(G(code),'receipts'),id);
const logIn=(b,code,by,byName,text)=>b.set(doc(collection(G(code),'history')),{ts:Date.now(),by,byName,text});
export const logEvent=(code,{by,byName,text})=>addDoc(collection(G(code),'history'),{ts:Date.now(),by,byName,text});
const watchOne=(ref,cb)=>{let off=()=>{},dead=false;authReady.then(()=>{if(!dead)off=onSnapshot(ref,cb)});return()=>{dead=true;off()}};

/* ---------- accounts: users/{accountCode} = {name, qrData, joinedGroups, createdAt} ---------- */
export async function getUser(code){await authReady;const s=await getDocFromServer(U(code));return s.exists()?s.data():null}
export async function createUser(code,name){ // false if the code is already taken
  await authReady;if((await getDocFromServer(U(code))).exists())return false;
  await setDoc(U(code),{name,qrData:'',joinedGroups:[],createdAt:Date.now()});return true}
export const watchUser=(code,onData,onMissing)=>watchOne(U(code),s=>{if(s.exists())onData(s.data());else if(!s.metadata.fromCache)onMissing()});

// Home screen auto-sync: one live listener per group in joinedGroups. cb(code, data|null, fromCache)
const gl=new Map();
export function watchGroups(codes,cb){authReady.then(()=>{
  codes.forEach(c=>{if(!gl.has(c))gl.set(c,onSnapshot(G(c),s=>cb(c,s.exists()?s.data():null,s.metadata.fromCache)))});
  [...gl.keys()].filter(c=>!codes.includes(c)).forEach(c=>{gl.get(c)();gl.delete(c)})})}
export const stopGroups=()=>{gl.forEach(f=>f());gl.clear()};
export const leaveGroup=(account,code)=>updateDoc(U(account),{joinedGroups:arrayRemove(code)});

// The payment QR lives on the account (qrData) and is mirrored into each group the person belongs to (members.{account}.qr),
// so everyone in a group reads it from the shared group document. The app keeps the mirrors in sync automatically.
export const saveUserQR=(account,img)=>updateDoc(U(account),{qrData:img}); // img = '' removes it
export const setMemberQR=(code,account,img)=>updateDoc(G(code),{[`members.${account}.qr`]:img?img:deleteField()});

/* ---------- groups: members are keyed by account code (guests by g_xxxxxx) ---------- */
export function createGroup({name,type,account,userName,qrData}){
  const code=String(Math.floor(100000+Math.random()*900000)),b=writeBatch(db);
  b.set(G(code),{name,type,round:false,created:Date.now(),members:{[account]:{name:userName,host:true,...(qrData?{qr:qrData}:{})}}});
  b.update(U(account),{joinedGroups:arrayUnion(code)});
  logIn(b,code,account,userName,`${userName} created “${name}”`);
  b.commit();return code} // not awaited: offline it stays queued
export async function joinGroup({code,account,userName,qrData}){
  await authReady;const s=await getDoc(G(code));if(!s.exists())throw new Error('nogroup');
  const d=s.data(),me=d.members[account],b=writeBatch(db);
  if(!me){b.update(G(code),{[`members.${account}`]:{name:userName,...(qrData?{qr:qrData}:{})}});logIn(b,code,account,userName,`${userName} joined the group`)}
  else if(qrData&&!me.qr)b.update(G(code),{[`members.${account}.qr`]:qrData}); // QR copies to the group when you join
  b.update(U(account),{joinedGroups:arrayUnion(code)});
  await b.commit();return d.name}
export const addGuest=(code,name)=>updateDoc(G(code),{[`members.${guestId()}`]:{name,guest:true}});
export const setRound=(code,v)=>updateDoc(G(code),{round:v});
export const setTheme=(code,color)=>updateDoc(G(code),{theme:color});
export const setClique=(code,id,v)=>updateDoc(G(code),{[`cliques.${id}`]:v===null?deleteField():v});

/* ---------- bills, claims, comments, payments ---------- */
export function saveReceipt(code,{id,...data}){const r=id?R(code,id):doc(collection(G(code),'receipts'));setDoc(r,data);return r.id}
export const delReceipt=(code,id)=>deleteDoc(R(code,id));
export const setClaim=(code,id,idx,member,on)=>updateDoc(R(code,id),{[`claims.${idx}.${member}`]:on?true:deleteField()});
export const setDispute=(code,id,d)=>updateDoc(R(code,id),{dispute:d});
export const addComment=(code,id,c)=>addDoc(collection(R(code,id),'comments'),{...c,ts:Date.now()});
export const watchComments=(code,id,cb)=>watchOne(query(collection(R(code,id),'comments'),orderBy('ts','asc')),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))));
export const recordPayment=(code,p)=>addDoc(collection(G(code),'payments'),{...p,ts:Date.now()});
export const delPayment=(code,id)=>deleteDoc(doc(G(code),'payments',id));
export async function deleteGroup(code,{receipts,payments,history,account}){
  await authReady;const g=G(code),b=writeBatch(db);
  receipts.forEach(id=>b.delete(doc(g,'receipts',id)));
  payments.forEach(id=>b.delete(doc(g,'payments',id)));
  history.forEach(id=>b.delete(doc(g,'history',id)));
  b.update(U(account),{joinedGroups:arrayRemove(code)});
  b.delete(g);return b.commit()}
export function watch(code,h){
  let u=[],dead=false;
  authReady.then(()=>{if(dead)return;const g=G(code),L=s=>s.docs.map(d=>({id:d.id,...d.data()}));
    u=[onSnapshot(g,s=>h.onGroup(s.exists()?s.data():null)),
       onSnapshot(query(collection(g,'receipts'),orderBy('ts','desc')),s=>h.onReceipts(L(s))),
       onSnapshot(collection(g,'payments'),s=>h.onPayments(L(s))),
       onSnapshot(query(collection(g,'history'),orderBy('ts','desc'),limit(200)),s=>h.onHistory(L(s)))]});
  return()=>{dead=true;u.forEach(f=>f())}}
