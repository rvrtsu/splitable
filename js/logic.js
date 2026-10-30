// Pure money logic. All amounts are integer centavos so nothing drifts.
const c=n=>Math.round((+n||0)*100);

// Split `total` across weights, handing leftover centavos to the largest remainders.
export function allocate(total,w){
  const ids=Object.keys(w),sum=ids.reduce((s,i)=>s+w[i],0);
  if(!ids.length||!sum)return{};
  const raw=ids.map(i=>[i,total*w[i]/sum]),out={};let left=total;
  raw.forEach(([i,v])=>{out[i]=Math.floor(v);left-=out[i]});
  raw.sort((a,b)=>(b[1]-Math.floor(b[1]))-(a[1]-Math.floor(a[1]))).slice(0,left).forEach(([i])=>out[i]++);
  return out;
}
const weights=it=>{const sp=it.split||{},o={};
  for(const id in sp.w||{}){const v=sp.mode==='equal'?1:+sp.w[id];if(v>0)o[id]=v}return o};

// Who owes what on one bill. Tax and service charge are shared in proportion to each person's own items.
export function receiptTotals(r){
  const sub={};let items=0,unassigned=0;
  (r.items||[]).forEach(it=>{
    const t=c(it.qty*it.price);items+=t;
    const a=allocate(t,weights(it));
    if(!Object.keys(a).length)unassigned++;
    for(const k in a)sub[k]=(sub[k]||0)+a[k];
  });
  const fees=c(r.tax)+c(r.service)-c(r.discount),share=allocate(fees,sub),owed={};
  for(const k in sub)owed[k]=sub[k]+(share[k]||0);
  return{sub:items,owed,unassigned,total:items+fees};
}

// Who actually paid the bill (centavos). One payer by default; r.payers = {memberId: pesos} when several people paid.
export function receiptPaid(r,total){
  const p=r.payers&&Object.keys(r.payers).length?r.payers:null;
  if(!p)return r.payer?{[r.payer]:total}:{};
  const o={};for(const k in p){const v=c(p[k]);if(v)o[k]=v}return o;
}
export const payersMatch=r=>{const t=receiptTotals(r).total;return t>0&&Object.values(receiptPaid(r,t)).reduce((s,x)=>s+x,0)===t};

// Payer and consumer are separate. For each person:  balance = cost - paid - sent + received
//   cost = their shared cost, paid = what they put down on bills, sent/received = settle-up payments.
//   Positive balance = they owe money. Negative balance = they are owed money.
// Items nobody was assigned to are absorbed by whoever paid, in proportion to what each paid.
export function ledger(rs,ps){
  const m={},g=k=>m[k]??={cost:0,paid:0,sent:0,got:0};
  rs.forEach(r=>{
    const t=receiptTotals(r),paid=receiptPaid(r,t.total),owed={...t.owed};
    const left=t.total-Object.values(owed).reduce((s,x)=>s+x,0);
    if(left){const a=allocate(left,paid);for(const k in a)owed[k]=(owed[k]||0)+a[k]}
    for(const k in owed)g(k).cost+=owed[k];
    for(const k in paid)g(k).paid+=paid[k];
  });
  ps.forEach(p=>{g(p.from).sent+=p.amt;g(p.to).got+=p.amt});
  for(const k in m)m[k].balance=m[k].cost-m[k].paid-m[k].sent+m[k].got;
  return m;
}
// Net position (+ is owed money, - owes money): the form the settle algorithm uses.
export const balances=(rs,ps)=>{const l=ledger(rs,ps),n={};for(const k in l)n[k]=-l[k].balance;return n};

// Largest set of disjoint zero-sum groups, found by dynamic programming over subsets (people with a balance, up to 16).
// A group of k people needs k-1 payments, so more groups means fewer payments overall.
function zeroGroups(v){
  const n=v.length,N=1<<n,sum=new Float64Array(N),dp=new Int8Array(N),pick=new Int8Array(N);
  for(let m=1;m<N;m++){
    const low=m&-m;sum[m]=sum[m^low]+v[31-Math.clz32(low)];
    let best=-1,bi=0;
    for(let j=0;j<n;j++)if(m>>j&1){const x=dp[m^(1<<j)];if(x>best){best=x;bi=j}}
    dp[m]=best+(sum[m]===0?1:0);pick[m]=bi;
  }
  const order=[];for(let m=N-1;m;){order.push(pick[m]);m^=1<<pick[m]}order.reverse();
  const groups=[];let cur=[],run=0;
  for(const i of order){cur.push(i);run+=v[i];if(run===0){groups.push(cur);cur=[]}}
  if(cur.length)groups.push(cur);
  return groups;
}

// Debt simplification: fewest payments that settle everyone. A owes B 100 and B owes C 100 becomes A pays C 100.
export function settle(net,whole){
  const n={...net};
  if(whole){ // round to whole pesos, then push the leftover onto the largest balance so the sum stays zero
    const ids=Object.keys(n);let s=0;ids.forEach(i=>{n[i]=Math.round(n[i]/100)*100;s+=n[i]});
    if(s&&ids.length){ids.sort((a,b)=>Math.abs(n[b])-Math.abs(n[a]));n[ids[0]]-=s}
  }
  const ids=Object.keys(n).filter(i=>n[i]!==0);
  const groups=ids.length<=16?zeroGroups(ids.map(i=>n[i])).map(g=>g.map(k=>ids[k])):[ids];
  const out=[];
  groups.forEach(g=>{
    const d=[],cr=[];g.forEach(i=>n[i]<0?d.push([i,-n[i]]):cr.push([i,n[i]]));
    d.sort((a,b)=>b[1]-a[1]);cr.sort((a,b)=>b[1]-a[1]);
    let i=0,j=0;
    while(i<d.length&&j<cr.length){
      const m=Math.min(d[i][1],cr[j][1]);
      if(m>0)out.push({from:d[i][0],to:cr[j][0],amt:m});
      d[i][1]-=m;cr[j][1]-=m;if(!d[i][1])i++;if(!cr[j][1])j++;
    }
  });
  return out;
}

export const peso=(v,whole)=>'₱'+(v/100).toLocaleString('en-PH',{minimumFractionDigits:whole||v%100===0?0:2,maximumFractionDigits:2});
export const inviteLink=code=>location.origin+location.pathname+'#/join/'+code;
export const payLink=code=>location.origin+location.pathname+'#/g/'+code; // opens the group on its Settle tab

/* ---- Categories and the spending pie ---- */
export const TAGS=['Food','Transpo','Accommodation','Groceries','Bills','Fun','Shopping','Other'];
export const TAG_COLORS={Food:'#2C4A8C',Transpo:'#B5651D',Accommodation:'#2E7D5B',Groceries:'#8E3B7A',Bills:'#C2A01E',Fun:'#B23A48',Shopping:'#4B8FA8',Other:'#7A6A5C'};
export function spendByTag(rs){
  const o={};rs.forEach(r=>{const t=r.tag||'Other';o[t]=(o[t]||0)+receiptTotals(r).total});
  return Object.entries(o).map(([tag,amt])=>({tag,amt})).filter(x=>x.amt>0).sort((a,b)=>b.amt-a.amt);
}
export function pieSlices(data,r=64,cx=70,cy=70){
  const tot=data.reduce((s,x)=>s+x.amt,0);let a=-Math.PI/2;
  return data.map(x=>{
    const f=x.amt/tot,b=a+f*2*Math.PI,p=t=>[cx+r*Math.cos(t),cy+r*Math.sin(t)].map(v=>+v.toFixed(2));
    const[x1,y1]=p(a),[x2,y2]=p(b),out={...x,pct:f<.01?'<1':Math.round(f*100),full:f>=.9999,d:`M${cx} ${cy}L${x1} ${y1}A${r} ${r} 0 ${f>.5?1:0} 1 ${x2} ${y2}Z`};
    a=b;return out;
  });
}

/* ---- Group colors: any color is allowed, but it is nudged until text on it stays readable ---- */
export const GROUP_COLORS=[['Cocoa','#3E2723'],['Ink blue','#2C4A8C'],['Forest','#2F6B4F'],['Plum','#7B3F73'],['Brick','#9A3B2E'],['Teal','#1F6F7A'],['Gold','#8A6A00']];
export const isHex=s=>/^#[0-9a-fA-F]{6}$/.test(s||'');
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
export const lum=h=>{const[r,g,b]=rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
const mix=(h,t,a)=>'#'+rgb(h).map((v,i)=>Math.round(v+(rgb(t)[i]-v)*a).toString(16).padStart(2,'0')).join('');
export function accent(color,dark){
  let h=isHex(color)?color.toLowerCase():'#3e2723';
  for(let i=0;i<12;i++){ // light mode: cream text on the color needs luminance <= .16; dark mode: charcoal text needs >= .25
    const L=lum(h);
    if(!dark&&L>.16)h=mix(h,'#000000',.15);else if(dark&&L<.25)h=mix(h,'#ffffff',.15);else break;
  }
  return h;
}

export function nudgeText({from,to,amt,tone='funny',group,link}){
  const T={
    funny:`Hey ${from}! Your ${amt} for ${group} is still hanging out in ${to}’s wallet like an uninvited guest. Send it over so we can all move on? 🙏\nPay here: ${link}`,
    gentle:`Hi ${from}, a small reminder about the ${amt} for ${group} (to ${to}). No rush, whenever you get a chance. Thank you!\nPay here: ${link}`,
    dramatic:`${from}. We need to talk. About ${amt}. ${group} was a beautiful night, but ${to} remembers everything. 🧾\nPay here: ${link}`};
  return T[tone]||T.funny;
}

/* ---- Accounts (Phase 1) ---- */
// 32 characters, no 0/O/1/I so codes are easy to read and type. 256 is divisible by 32, so there is no modulo bias.
export const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateAccountCode(len=6){
  const a=new Uint8Array(len);crypto.getRandomValues(a);
  return Array.from(a,b=>CODE_ALPHABET[b%CODE_ALPHABET.length]).join('');
}
export const normalizeCode=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const isAccountCode=s=>/^[A-HJ-NP-Z2-9]{6}$/.test(s); // keep identical to the regex in firestore.rules
// Guests have no account, so they get a short random key that can never collide with an account code (lowercase + underscore).
export const guestId=()=>'g_'+generateAccountCode(6).toLowerCase();
