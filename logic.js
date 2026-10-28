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

// Net position per person across all bills and recorded payments (+ is owed money, - owes money).
export function balances(rs,ps){
  const n={},add=(k,v)=>n[k]=(n[k]||0)+v;
  rs.forEach(r=>{let s=0;const{owed}=receiptTotals(r);for(const k in owed){add(k,-owed[k]);s+=owed[k]}add(r.payer,s)});
  ps.forEach(p=>{add(p.from,p.amt);add(p.to,-p.amt)});
  return n;
}

// Debt simplification: match the biggest debtor with the biggest creditor until everyone is square.
// A owes B 100 and B owes C 100 collapses to A owes C 100 because B's net is zero.
export function settle(net,whole){
  const n={...net};
  if(whole){ // round each balance to whole pesos, then push the leftover onto the largest balance so the sum stays zero
    const ids=Object.keys(n);let s=0;ids.forEach(i=>{n[i]=Math.round(n[i]/100)*100;s+=n[i]});
    if(s&&ids.length){ids.sort((a,b)=>Math.abs(n[b])-Math.abs(n[a]));n[ids[0]]-=s}
  }
  const d=[],cr=[];
  for(const i in n){if(n[i]<0)d.push([i,-n[i]]);else if(n[i]>0)cr.push([i,n[i]])}
  d.sort((a,b)=>b[1]-a[1]);cr.sort((a,b)=>b[1]-a[1]);
  const out=[];let i=0,j=0;
  while(i<d.length&&j<cr.length){
    const m=Math.min(d[i][1],cr[j][1]);
    if(m>0)out.push({from:d[i][0],to:cr[j][0],amt:m});
    d[i][1]-=m;cr[j][1]-=m;if(!d[i][1])i++;if(!cr[j][1])j++;
  }
  return out;
}

export const peso=(v,whole)=>'₱'+(v/100).toLocaleString('en-PH',{minimumFractionDigits:whole||v%100===0?0:2,maximumFractionDigits:2});
export const inviteLink=code=>location.origin+location.pathname+'#/join/'+code;

export function nudgeText(name,amt,tone,group){
  const T={
    funny:`Hey ${name}! Your ${amt} from ${group} is still sitting in my wallet like an uninvited guest. Send it over so we can both stop thinking about it? 🙏`,
    gentle:`Hi ${name}, a small reminder about the ${amt} for ${group}. No rush, whenever you get a chance. Thank you!`,
    dramatic:`${name}. We need to talk. About ${amt}. ${group} was a beautiful night, but the receipt remembers everything. 🧾`};
  return T[tone]||T.funny;
}
