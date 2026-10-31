import*as F from'./firebase.js';
import{POT,receiptTotals,splitOf,ledger,settle,peso,nudgeText,inviteLink,payLink,generateAccountCode,normalizeCode,isAccountCode,TAGS,TAG_COLORS,spendByTag,pieSlices,accent,isHex,GROUP_COLORS,wrapped,fmtDur}from'./logic.js';

const $=s=>document.querySelector(s),app=$('#app'),sheet=$('#sheet'),modal=$('#modal'),navEl=$('#nav');
const LS=(k,v)=>v===undefined?JSON.parse(localStorage.getItem('splitable.'+k)||'null'):localStorage.setItem('splitable.'+k,JSON.stringify(v));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>'&#'+m.charCodeAt(0)+';');
const S={route:'home',hm:'new',tab:'bills',start:{step:'choose',code:''},account:null,user:null,groups:{},code:null,me:null,group:null,
  receipts:[],payments:[],history:[],comments:[],billId:null,tr:[],draft:null,sheet:null,acc:{},sig:{}};
const TABS=['bills','settle','history','insights','more'];
const mem=()=>S.group?.members||{},hostId=()=>Object.keys(mem()).find(k=>mem()[k].host);
const nm=id=>id===POT?'Group fund':mem()[id]?.name||'Someone';
const onoff=v=>v?'On':'Off',dark=()=>LS('theme')==='dark';
const blank=()=>({name:'',qty:1,price:'',split:{mode:'equal',w:{}}});
const typing=()=>document.activeElement?.matches('input:not([type=color]):not([type=checkbox]),select,textarea');
const CHEV='<svg viewBox="0 0 24 24" width=18 height=18 fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d="M6 9l6 6 6-6"/></svg>';
const WC=['#2C4A8C','#7B3F73','#2F6B4F','#9A3B2E','#1F6F7A'];

/* ---------- sounds (synthesized, so there are no audio files to load) ---------- */
let ac;const ctx=()=>ac??=new AudioContext();
const tone=(f,d,t='sine',v=.06,at=0)=>{if(LS('mute'))return;const x=ctx(),o=x.createOscillator(),g=x.createGain(),s=x.currentTime+at;
  o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,s);g.gain.exponentialRampToValueAtTime(.0001,s+d);o.connect(g).connect(x.destination);o.start(s);o.stop(s+d)};
const click=()=>tone(1400,.03,'square',.02),ding=()=>{tone(1568,.5,'sine',.08);tone(2093,.7,'sine',.05,.08)};
const rustle=()=>{if(LS('mute'))return;const x=ctx(),n=x.sampleRate*.35,b=x.createBuffer(1,n,x.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n)**2;const s=x.createBufferSource(),f=x.createBiquadFilter(),g=x.createGain();
  f.type='highpass';f.frequency.value=2500;g.gain.value=.15;s.buffer=b;s.connect(f).connect(g).connect(x.destination);s.start()};

/* ---------- helpers ---------- */
let tt;const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2800)};
const busy=(on,msg)=>{$('#busy').hidden=!on;if(msg)$('#busymsg').textContent=msg};
const copy=async s=>{try{await navigator.clipboard.writeText(s)}catch{const a=document.createElement('textarea');a.value=s;document.body.append(a);a.select();document.execCommand('copy');a.remove()}};
const net=()=>document.body.classList.toggle('off',!navigator.onLine);
const openModal=h=>{modal.innerHTML=`<div class=scrim data-act=closemodal></div><div class=dlg>${h}</div>`;modal.offsetHeight;modal.classList.add('on')};
const ask=(title,text,label,fn)=>{S.ok=fn;openModal(`<h3>${title}</h3><p class=mu>${text}</p><div class=row2 style="margin-top:12px"><button class="btn ghost" data-act=closemodal>Cancel</button><button class="btn danger" data-act=yes>${label}</button></div>`)};
const when=ts=>new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const log=text=>F.logEvent(S.code,{by:S.account,byName:S.user.name,text});
const timeout=(p,ms)=>Promise.race([p,new Promise((_,no)=>setTimeout(()=>no(new Error('timeout')),ms))]);
const payersText=r=>(r.payers&&Object.keys(r.payers).length?Object.keys(r.payers):[r.payer]).map(nm).join(', ');
const model=()=>{const L=ledger(S.receipts,S.payments),net={};for(const k in L)net[k]=-L[k].balance;return{L,tr:settle(net,S.group.round)}};
const acc=(key,title,body,o={})=>{const open=!!(S.acc[key]??o.open);
  return`<section class="acc ${open?'open':''}"><button class=acc-h data-act=acc data-k=${key} aria-expanded=${open}><span>${title}${o.sub?`<small>${o.sub}</small>`:''}</span>${CHEV}</button><div class=acc-b><div class=acc-i>${body}</div></div></section>`};
function applyTheme(){
  const t=LS('theme')||'';document.documentElement.dataset.theme=t;document.querySelector('meta[name=theme-color]').content=t?'#201e1c':'#F9F6F0';
  const inGroup=S.account&&['group','edit','bill'].includes(S.route)&&S.group?.theme;
  inGroup?document.documentElement.style.setProperty('--gc',accent(S.group.theme,dark())):document.documentElement.style.removeProperty('--gc')}
async function shrink(file,max=360){ // payment QR becomes a small picture stored inside the group document
  const b=await createImageBitmap(file),s=Math.min(1,max/Math.max(b.width,b.height)),cv=document.createElement('canvas');
  cv.width=Math.round(b.width*s);cv.height=Math.round(b.height*s);const x=cv.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(b,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',.82)}
const needCanvas=()=>window.html2canvas?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=ok;s.onerror=no;document.head.append(s)});

/* ---------- render pipeline: repaint only the region whose data changed ---------- */
const same=(k,v,f=JSON.stringify)=>{const s=f(v);if(S.sig[k]===s)return true;S.sig[k]=s;return false}; // skip identical snapshots
const sigGroup=g=>g?JSON.stringify({...g,members:Object.fromEntries(Object.entries(g.members||{}).map(([k,m])=>[k,{...m,qr:m.qr?m.qr.length:0}]))}):'null';
const TABDEPS={bills:['group','receipts','payments'],settle:['group','receipts','payments'],history:['group','history'],insights:['group','receipts','payments'],more:['group','user']};
const dirty=new Set();let raf=0;
const mark=(...k)=>{k.forEach(x=>dirty.add(x));raf||(raf=requestAnimationFrame(flush))}; // many snapshots in one frame = one paint
function flush(){raf=0;if(!S.account)return;
  if(typing()){S.deferred=true;return} // never repaint under someone who is typing
  const d=[...dirty];dirty.clear();
  if(S.route==='home'){if(d.includes('user')||d.includes('groups'))paintHome();return}
  if(S.route==='edit')return;
  const deps=S.route==='bill'?['group','receipts','comments']:TABDEPS[S.tab];
  if(d.includes('group'))paintHdr();
  if(d.some(k=>deps.includes(k)))paintView()}
document.addEventListener('focusout',()=>setTimeout(()=>{if(S.deferred&&!typing()){S.deferred=false;mark()}},80));
const paintHome=()=>{app.innerHTML=vHome()};
const paintHdr=()=>{const h=$('#hdr');if(h)h.innerHTML=S.route==='bill'?vBillHdr():vHdr()};
function paintView(anim){const v=$('#view');if(!v)return;
  v.innerHTML=S.group?(S.route==='bill'?vBill():vTab()):'<p class=mu>Loading group…</p>';
  if(anim){v.classList.remove('enter');void v.offsetWidth;v.classList.add('enter')}}
function nav(){const show=S.account&&(S.route==='group'||S.route==='bill');navEl.classList.toggle('hide',!show);
  navEl.style.setProperty('--i',Math.max(0,TABS.indexOf(S.route==='bill'?'bills':S.tab)));
  navEl.querySelectorAll('.nv').forEach(b=>b.setAttribute('aria-current',b.dataset.k===(S.route==='bill'?'bills':S.tab)&&show?'page':'false'))}
function render(){applyTheme();
  if(!S.account)app.innerHTML=vStart();
  else if(S.route==='home')paintHome();
  else if(S.route==='edit'){app.innerHTML=vEdit();updTotals()}
  else{app.innerHTML='<div id=hdr></div><div id=view class="view enter"></div>';paintHdr();paintView()}
  nav();S.fresh=null;S.unfold=false}
const go=r=>{S.route=r;render();scrollTo(0,0)};

/* ---------- views: start + app home ---------- */
const settingsBody=()=>`<div class=row><span>Dark mode</span><button class="btn ghost sm" data-act=theme>${onoff(dark())}</button></div>
<div class=row style="margin-top:10px"><span>Sounds</span><button class="btn ghost sm" data-act=mute>${onoff(!LS('mute'))}</button></div>`;

const vStart=()=>{const s=S.start;
  const invite=S.joinCode?`<div class=paper><small>You’re invited to group <b>${S.joinCode}</b>. Log in or create an account and you’ll join automatically.</small></div>`:'';
  if(s.step==='new')return`<div class="narrow"><div class=hdr><button class="btn ghost sm" data-act=startback aria-label=Back>←</button><div class=ht><h2>Your account code</h2></div></div>${invite}
<div class=paper><div class=codebox>${s.code}</div><div class=row2><button class="btn ghost" data-act=copycode>Copy code</button><button class="btn ghost" data-act=newcode>Make another</button></div>
<p class=mu><small>This code is your login. Save it in your notes or send it to yourself. Anyone who has it can open your account, and it can’t be recovered.</small></p></div>
<form class=paper data-form=signup><label>Your name<input name=name maxlength=40 autocomplete=given-name placeholder="Maria" value="${esc(s.name||'')}" required></label>
<label class=check><input type=checkbox required> I’ve saved my code</label><button class="btn wide">Create account</button></form></div>`;
  return`<div class=narrow><h1>Splitable</h1><p class=mu>Split any bill fairly. Your account is a 6-character code, with no email or password.</p>${invite}
<div class=paper><h3>New here?</h3><p class=mu><small>We’ll make you a personal code.</small></p><button class="btn wide" data-act=startnew>Create my account</button></div>
<div class=paper><h3>Already have a code?</h3><form data-form=login><label>Account code<input class=codein name=code maxlength=6 autocapitalize=characters autocomplete=off spellcheck=false placeholder="K7M2QX" required></label><button class="btn wide">Log in</button></form></div>
${acc('hs','App settings',settingsBody(),{sub:'Dark mode, sounds'})}</div>`};

const vHome=()=>{if(!S.user)return'<p class=mu>Loading your account…</p>';
  const ids=S.user.joinedGroups||[],n=S.hm==='new';
  return`<h1>Hi, ${esc(S.user.name)}</h1>
<div class="paper row"><span><small class=mu>Your account code</small><br><b class=code>${S.account}</b></span><button class="btn ghost sm" data-act=copycode>Copy</button></div>
${ids.length?`<h3 class=sec>Your groups</h3><div class=grid>${ids.map(c=>{const g=S.groups[c];return`<div class="paper row" style="--gc:${accent(g?.theme,dark())};border-left:6px solid var(--gc)"><button class=full data-act=open data-code=${c} style="background:none;border:0;padding:0"><b>${g?esc(g.name):'Loading…'}</b><br><small class=mu>Code ${c}${g?`, ${Object.keys(g.members).length} members`:''}</small></button><button class=lnk data-act=forget data-code=${c}>Remove</button></div>`}).join('')}</div>`:'<p class=mu>No groups yet. Create one or join with a code.</p>'}
<div class="paper narrow" style="margin-inline:0"><div class=seg><button class="${n?'on':''}" data-act=hm data-k=new>New group</button><button class="${n?'':'on'}" data-act=hm data-k=join>Join a group</button></div>
${n?`<form data-form=create>
<label>Group name<input name=name placeholder="Friday dinner" required></label>
<label>Group type<select name=type><option value=once>One-time: a single outing</option><option value=ongoing>Ongoing: roommates or regular friends</option></select></label>
<button class="btn wide">Create group</button></form>`
:`<form data-form=join>
<label>6-digit group code<input name=code inputmode=numeric maxlength=6 pattern="\\d{6}" value="${S.joinCode||''}" placeholder="123456" required></label>
<button class="btn wide">Join group</button></form>`}</div>
${acc('hs','App settings',settingsBody(),{sub:'Dark mode, sounds'})}
${acc('ha','Account',`<p class=mu><small>Log in with your code on any device and your groups appear automatically.</small></p><button class="btn ghost wide" data-act=logout>Log out</button>`,{sub:esc(S.user.name)})}`};

/* ---------- views: group ---------- */
const vHdr=()=>{const g=S.group;return`<div class=hdr><button class="btn ghost sm" data-act=home aria-label="Back to groups">←</button><div class=ht><h2>${g?esc(g.name):'Loading…'}</h2><small class=mu>${g?(g.type==='once'?'One-time':'Ongoing')+' group, code ':'Code '}<b class=mono>${S.code}</b></small></div><button class="btn sm" data-act=invite>Invite</button></div>`};
const vBillHdr=()=>`<div class=hdr><button class="btn ghost sm" data-act=billback aria-label="Back to bills">←</button><div class=ht><h2>Bill</h2></div></div>`;
const vTab=()=>{const m=model();S.tr=m.tr;return{bills:vBillsTab,settle:vSettleTab,history:vHistory,insights:vInsights,more:vMore}[S.tab](m)};

const billCard=r=>{const t=receiptTotals(r);
  return`<button class="paper bill full" data-act=openbill data-id=${r.id}><b>${esc(r.title)}${r.dispute?.open?'<span class="badge warn">Disputed</span>':''}${r.claimMode&&t.unassigned?`<span class="badge ok">${t.unassigned} to claim</span>`:''}</b><b class=mono>${peso(t.total)}</b><small class=mu>${esc(r.tag||'Other')}, paid by ${esc(payersText(r))}, ${r.items.length} item${r.items.length===1?'':'s'}</small></button>`};

const vFund=(m,f)=>{const ins=S.payments.filter(p=>p.to===POT).sort((a,b)=>b.ts-a.ts).slice(0,5);
  return`<p class=mu><small>Everyone chips in. Bills marked “paid by Group fund” come out of the balance, and leftover money stays for next time.</small></p>
<div class=row><span>Fund balance</span><b class=amt>${f<0?'−':''}${peso(Math.abs(f))}</b></div>${f<0?'<small class=mu>The fund is overdrawn. Settle shows who tops it up.</small>':''}
<button class="btn wide" style="margin-top:12px" data-act=contrib>Add money to the fund</button>
${ins.map(p=>`<div class=who2><span>${esc(nm(p.from))}<small class=mu>${when(p.ts)}</small></span><b class=mono>+${peso(p.amt)}</b></div>`).join('')}`};

const vBillsTab=m=>{const g=S.group,me=m.L[S.me],bal=me?me.balance:0,f=m.L[POT]?.balance||0,
  total=S.receipts.reduce((s,r)=>s+receiptTotals(r).total,0),closed=g.type==='once'&&S.receipts.length>0&&!m.tr.length;
  return`<div class="paper sum"><small class=mu>Total spent</small><div class=amtbig>${peso(total)}</div><div class=perf></div>
<div class=row><span class=mu>Your balance</span><b class=mono>${bal>0?`you owe ${peso(bal)}`:bal<0?`you’re owed ${peso(-bal)}`:'all settled'}</b></div></div>
${closed?'<div class=stamp>All paid</div>':'<button class="btn wide" data-act=newbill>+ Add a bill</button>'}
${S.receipts.length?`<h3 class=sec>Bills</h3><div class=grid>${S.receipts.map(billCard).join('')}</div>`
:`<div class=paper><h3>How it works</h3><ol class=steps><li>Add a bill and type in the items.</li><li>Tap who shared each item, or let everyone claim their own.</li><li>Open Settle to see who pays whom.</li></ol></div>`}
${acc('fund','Group fund',vFund(m,f),{sub:S.payments.some(p=>p.to===POT)||f?`Balance ${f<0?'−':''}${peso(Math.abs(f))}`:'Pool money for shared expenses'})}`};

const vSettleTab=m=>{const w=S.group.round,has=S.receipts.length,tr=m.tr;
  const head=!has?'Add a bill first, then come back here.':tr.length?`${tr.length} payment${tr.length>1?'s':''} settle${tr.length>1?'':'s'} everything`:'Everyone is settled up';
  const paid=S.payments.slice().sort((a,b)=>b.ts-a.ts).slice(0,5);
  const share=Object.entries(m.L).map(([id,x])=>{const b=x.balance;
    return`<div class=who2><span>${esc(nm(id))}<small class=mu>Share ${peso(x.cost)}, paid ${peso(x.paid+x.sent-x.got)}</small></span><span class=owe>${id===POT?(b>0?`holds ${peso(b)}`:b<0?`overdrawn ${peso(-b)}`:'empty'):b>0?`owes ${peso(b)}`:b<0?`is owed ${peso(-b)}`:'settled'}</span></div>`}).join('');
  return`<h3 class=sec>${head}</h3>
<div class=grid>${tr.map((t,i)=>`<div class=paper><div class=tx><span><b>${esc(nm(t.from))}</b> pays <b>${esc(nm(t.to))}</b></span><b class=amt>${peso(t.amt,w)}</b></div>
<div class=row2><button class=btn data-act=settleup data-i=${i}>Pay</button>${t.from===POT?'':`<button class="btn ghost" data-act=nudge data-i=${i}>Nudge</button>`}</div></div>`).join('')}</div>
${has?acc('share','Everyone’s share',share,{sub:'Who paid and who ate what'}):''}
${paid.length?acc('pays','Recent payments',paid.map(p=>`<div class=who2><span>${esc(nm(p.from))} paid ${esc(nm(p.to))}<small class=mu>${when(p.ts)}</small></span><span class=owe>${peso(p.amt)}<br><button class=lnk data-act=undopay data-id=${p.id}>Undo</button></span></div>`).join(''),{sub:'Tap Undo to reverse one'}):''}
${has?acc('opt','Options',`<div class=row><span>Round to whole pesos<br><small class=mu>Skips the centavos</small></span><button class="btn ghost sm" data-act=round>${onoff(w)}</button></div>`,{sub:`Whole-peso rounding ${onoff(w).toLowerCase()}`}):''}
${has?`<div class=row2 style="margin-top:16px"><button class=btn data-act=summarypick>Generate summary</button><button class="btn ghost" data-act=roulette>Bill roulette</button></div>`:''}`};

const vHistory=()=>`<h3 class=sec>Activity</h3>${S.history.length?`<div class=paper>${S.history.map(h=>`<div class=logrow><span>${esc(h.text)}</span><small class=mu>${when(h.ts)}</small></div>`).join('')}</div>`
:'<p class=mu>Nothing here yet. Every change to the group shows up here.</p>'}`;

const vPie=()=>{const d=spendByTag(S.receipts);if(!d.length)return'';const sl=pieSlices(d);
  return`<h3 class=sec>Top spending categories</h3><div class=paper><div class=pie>
<svg viewBox="0 0 140 140" role=img aria-label="Spending by category">${sl.map(s=>s.full?`<circle cx=70 cy=70 r=64 fill="${TAG_COLORS[s.tag]}"/>`:`<path d="${s.d}" fill="${TAG_COLORS[s.tag]}" stroke="var(--card)" stroke-width=2 />`).join('')}</svg>
<ul class=legend>${sl.map(s=>`<li><i class=dot style="background:${TAG_COLORS[s.tag]}"></i><span>${esc(s.tag)}</span><b class=mono>${peso(s.amt)}</b><small class=mu>${s.pct}%</small></li>`).join('')}</ul></div></div>`};

const vInsights=()=>{const w=wrapped(S.receipts,S.payments);
  if(!w.bills)return`<h3 class=sec>Splitable Wrapped</h3><div class=paper><p class=mu>Add a few bills and your group’s stats show up here.</p></div>`;
  const cards=[w.top&&['Top spender',nm(w.top.id),`paid ${peso(w.top.amt)} out of pocket`],w.big&&['Biggest appetite',nm(w.big.id),`${peso(w.big.amt)} of the bills`],
    w.fast&&['Fastest payer',nm(w.fast.id),`pays ${fmtDur(w.fast.ms)} after a bill, on average`],['Top category',w.tags[0].tag,`${peso(w.tags[0].amt)} spent`],
    w.boss&&['Bill boss',nm(w.boss.id),`added ${w.boss.n} bill${w.boss.n>1?'s':''}`]].filter(Boolean);
  return`<h3 class=sec>Splitable Wrapped</h3><div class=wrow>${cards.map((c,i)=>`<div class=wcard style="--c:${WC[i%WC.length]}"><small>${c[0].toUpperCase()}</small><b>${esc(c[1])}</b><span>${c[2]}</span></div>`).join('')}</div>
<div class="paper sum"><small class=mu>Total spent across ${w.bills} bill${w.bills>1?'s':''}</small><div class=amtbig>${peso(w.total)}</div></div>${vPie()}`};

const vMore=()=>{const g=S.group,ms=Object.entries(mem()),cur=g.theme||'#3E2723',cq=Object.entries(g.cliques||{}),host=mem()[S.me]?.host;
  const members=`${ms.map(([id,m])=>`<div class=who2><span>${esc(m.name)}${id===S.me?' (you)':''}</span><small class=mu>${m.guest?'Guest':m.host?'Host':'Member'}</small></div>`).join('')}
<form data-form=guest style="margin-top:12px"><label>Add a guest<small> (a friend without the app; you track what they owe)</small><input name=name placeholder="Guest’s name" required></label><button class="btn sm">Add guest</button></form>`;
  const cliques=`${cq.map(([id,c])=>`<div class=who2><span>${esc(c.name)}<small class=mu>${c.members.filter(x=>mem()[x]).map(x=>esc(nm(x))).join(', ')}</small></span><button class="lnk danger-t" data-act=delcq data-id=${id}>Delete</button></div>`).join('')}
<form data-form=clique style="margin-top:12px"><label>New clique<input name=name placeholder="Roommates" maxlength=24 required></label><div class=who style="margin:0 0 12px">${ms.map(([id,m])=>`<label class=check style="margin:0"><input type=checkbox name=m value=${id}> ${esc(m.name)}</label>`).join('')}</div><button class="btn sm">Save clique</button></form>`;
  const color=`<p class=mu><small>Shows on Home so you can tell groups apart.</small></p><div class=swatches>${GROUP_COLORS.map(([n,c])=>`<button class="sw ${cur.toLowerCase()===c.toLowerCase()?'on':''}" style="background:${accent(c,dark())}" data-act=color data-c="${c}" aria-label="${n}"></button>`).join('')}
<label class="sw cust" aria-label="Pick a custom color"><input type=color id=gcolor value="${isHex(cur)?cur:'#3E2723'}"></label></div>`;
  const qr=`<p class=mu><small>Friends see it when they tap Pay. It’s copied into every group you’re in.</small></p>${S.user?.qrData?`<img class=qr src="${S.user.qrData}" alt="Your payment QR">`:''}
<label class="btn ghost wide" for=qr style="margin-top:12px">${S.user?.qrData?'Replace QR':'Upload GCash, Maya or bank QR'}</label><input id=qr type=file accept="image/*" hidden>`;
  const opts=host?'<p class=mu><small>Deleting removes every bill and payment for everyone in the group.</small></p><button class="btn danger wide" data-act=delgroup>Delete group</button>'
    :'<p class=mu><small>This only removes the group from your account. You can rejoin with the code.</small></p><button class="btn ghost wide" data-act=leave>Remove from my groups</button>';
  return`<h3 class=sec>Group</h3>
${acc('mem','Members',members,{sub:`${ms.length} member${ms.length>1?'s':''}`})}
${acc('cq','Cliques',cliques,{sub:cq.length?`${cq.length} saved`:'Quick-select groups of members'})}
${acc('col','Group color',color,{sub:'Tell your groups apart'})}
${acc('qr','My payment QR',qr,{sub:S.user?.qrData?'Saved':'Not added yet'})}
${acc('set','App settings',settingsBody(),{sub:'Dark mode, sounds'})}
${acc('opt2','Group options',opts,{sub:host?'Delete group':'Leave group'})}`};

/* ---------- views: bill detail (claiming + comments) ---------- */
const billItem=(r,it,i)=>{const ids=Object.keys(splitOf(r,it,i).w||{}),line=peso(Math.round(it.qty*it.price*100)),label=`${esc(it.name)}${it.qty>1?` ×${it.qty}`:''}`;
  if(!r.claimMode)return`<div class=who2><span>${label}<small class=mu>${ids.length?ids.map(x=>esc(nm(x))).join(', '):'Nobody assigned'}</small></span><b class=mono>${line}</b></div>`;
  const mine=ids.includes(S.me);
  return`<div class=citem><div class=row><b>${label}</b><b class=mono>${line}</b></div><div class=who>
<button class="btn sm ${mine?'':'ghost'}" data-act=claim data-i=${i} data-id=${S.me}>${mine?'✓ Mine':'That’s mine'}</button>
${Object.entries(mem()).filter(([id])=>id!==S.me).map(([id,m])=>`<button class="chip ${ids.includes(id)?'on':''}" data-act=claim data-i=${i} data-id=${id}>${esc(m.name)}</button>`).join('')}</div></div>`};
const vComments=()=>`${S.comments.map(c=>`<div class=cm><small><b>${esc(c.byName)}</b>, ${when(c.ts)}${c.dispute?' <span class="badge warn">Dispute</span>':''}</small><p>${esc(c.text)}</p></div>`).join('')||'<p class=mu><small>No comments yet.</small></p>'}
<form data-form=comment style="margin-top:12px"><textarea name=text rows=2 maxlength=500 placeholder="Ask a question or explain something…" required></textarea>
<label class=check style="margin:10px 0"><input type=checkbox name=dispute> Flag as a dispute</label><button class="btn sm">Send</button></form>`;
const vBill=()=>{const r=S.receipts.find(x=>x.id===S.billId);if(!r)return'<p class=mu>This bill was deleted.</p>';
  const t=receiptTotals(r),mine=t.owed[S.me]||0,owed=Object.entries(t.owed).map(([id,v])=>`<div class=who2><span>${esc(nm(id))}</span><b class=mono>${peso(v)}</b></div>`).join('')||'<p class=mu><small>Nobody is assigned yet.</small></p>';
  return`<div class=narrow><div class=paper><div class=row><h3 style="margin:0">${esc(r.title)}</h3><b class=amt>${peso(t.total)}</b></div><small class=mu>${esc(r.tag||'Other')}, paid by ${esc(payersText(r))}</small>
${t.total>t.sub?`<div class=perf></div><small class=mu>Includes ${peso(t.total-t.sub)} of tax and fees, shared by what each person ordered.</small>`:''}</div>
${r.dispute?.open?`<div class=alert><b>Disputed</b><p>${esc(r.dispute.byName)} flagged a problem with this bill. Talk it out in the comments, then mark it resolved.</p><button class="btn sm" data-act=resolve>Mark resolved</button></div>`:''}
<div class=paper><h3>${r.claimMode?'Tap what you had':'Items'}</h3>${r.items.map((it,i)=>billItem(r,it,i)).join('')}
${r.claimMode?`<div class=perf></div><div class=row><span>Your total so far</span><b class=amt>${peso(mine)}</b></div>`:''}</div>
${acc('owed','Who owes what',owed,{sub:'Including tax and fees'})}
${acc('cm','Comments',vComments(),{sub:S.comments.length?`${S.comments.length} comment${S.comments.length>1?'s':''}`:'Ask or clarify',open:true})}
<div class=row2 style="margin-top:14px"><button class="btn ghost" data-act=editbill>Edit bill</button><button class="btn ghost danger-t" data-act=delbill>Delete</button></div></div>`};

/* ---------- views: bill editor ---------- */
const itemRow=(it,i)=>{const w=it.split.w,m=it.split.mode,cl=S.draft.claimMode,cq=Object.entries(S.group.cliques||{});
  return`<div class="item ${!cl&&Object.keys(w).length?'assigned':''} ${S.fresh===i?'fresh':''}"><div class=iline>
<input class=nmi data-i=${i} data-k=name value="${esc(it.name)}" placeholder="Item name" aria-label="Item name">
<input class=qty data-i=${i} data-k=qty type=number inputmode=numeric min=1 value="${it.qty}" aria-label=Quantity>
<input class=prc data-i=${i} data-k=price type=number inputmode=decimal step=any placeholder="0" value="${it.price}" aria-label="Price each">
<button class=xb data-act=rmitem data-i=${i} aria-label="Remove item">✕</button></div>
${cl?'':`<div class=who>${Object.entries(mem()).map(([id,mm])=>`<button class="chip ${id in w?'on':''}" data-act=tog data-i=${i} data-id=${id}>${esc(mm.name)}</button>`).join('')}
${cq.map(([id,c])=>`<button class="chip q" data-act=cqpick data-i=${i} data-id=${id}>${esc(c.name)}</button>`).join('')}
<button class=lnk data-act=assign data-i=${i}>${m==='equal'?'Custom split':m==='pct'?'Edit % split':m==='shares'?'Edit shares':'Edit ₱ split'}</button></div>`}</div>`};

const vPayers=d=>{const opts=[...Object.entries(mem()).map(([id,m])=>[id,m.name]),[POT,'Group fund']];
  return d.multi?`<h3>Who paid, and how much?</h3>${opts.map(([id,n])=>`<div class=row style="margin-bottom:6px"><span>${esc(n)}</span><input data-pay=${id} type=number inputmode=decimal step=any placeholder="0" value="${esc(d.payers[id]??'')}" style="width:120px;text-align:right" aria-label="${esc(n)} paid"></div>`).join('')}
<p><small id=paychk class=mu></small></p><button class=lnk data-act=single>One person paid instead</button>`
  :`<label>Who paid the bill?<select data-f=payer>${opts.map(([id,n])=>`<option value=${id} ${id===d.payer?'selected':''}>${esc(n)}</option>`).join('')}</select></label><button class=lnk data-act=multi>Multiple people paid</button>`};

const vEdit=()=>{const d=S.draft;
  return`<div class=narrow><div class=hdr><button class="btn ghost sm" data-act=back aria-label=Back>←</button><div class=ht><h2>${d.id?'Edit bill':'New bill'}</h2></div></div>
<div class=paper><label>What was it for?<input data-f=title placeholder="Dinner at Mang Inasal" value="${esc(d.title)}"></label>
<small class=mu>Category</small><div class=who style="margin:6px 0 14px">${TAGS.map(t=>`<button class="chip ${d.tag===t?'on':''}" data-act=tag data-k=${t}>${t}</button>`).join('')}</div>${vPayers(d)}</div>
<div class=paper><div class=seg><button class="${d.claimMode?'':'on'}" data-act=cmode data-k=0>I’ll assign people</button><button class="${d.claimMode?'on':''}" data-act=cmode data-k=1>Everyone claims theirs</button></div>
<p class=mu style="margin:0"><small>${d.claimMode?'You list the items and prices. Everyone opens the bill and taps what they had.':'You tap who shared each item.'}</small></p></div>
<div class="paper ${S.unfold?'unfold':''}"><div class=row><h3>Items</h3>${d.claimMode?'':'<button class=lnk data-act=all>Everyone shares all</button>'}</div>
<div class=cols><span class=nmi>Item</span><span class=qty>Qty</span><span class=prc>Price each</span><span style="width:34px"></span></div>
${d.items.map(itemRow).join('')}<div class=row2><button class="btn ghost" data-act=additem>+ Add item</button></div>
${d.claimMode?'':'<button class=lnk data-act=splitall>Split every item by percent or shares</button>'}</div>
${acc('fees','Tax and fees',`<p class=mu><small>Shared in proportion to what each person ordered.</small></p>${[['tax','Tax'],['service','Service charge'],['discount','Discount']].map(([k,l])=>`<div class=row style="margin-top:8px"><span>${l}</span><input data-f=${k} type=number inputmode=decimal step=any placeholder="0" value="${d[k]||''}" style="width:120px;text-align:right" aria-label="${l}"></div>`).join('')}`,{sub:'Optional',open:!!(d.tax||d.service||d.discount)})}
${d.id?'<button class="btn ghost wide danger-t" style="margin-top:12px" data-act=delbill>Delete this bill</button>':''}</div>
<div class=bar><div><small class=mu id=warn>&nbsp;</small><b class=mono id=tot></b></div><button class=btn id=save data-act=savebill>Save bill</button></div>`};

const sheetSp=()=>S.sheet==='all'?S.allSplit:S.draft.items[S.sheet].split;
const vSheet=()=>{const all=S.sheet==='all',it=all?null:S.draft.items[S.sheet],sp=sheetSp();
  const modes=all?[['pct','By percent'],['shares','By shares']]:[['equal','Equal'],['pct','Percent'],['shares','Shares'],['exact','Amount']];
  const hint={equal:'Everyone you pick pays the same amount.',pct:'Type each person’s percent. For 60/40, enter 60 and 40.',shares:'Type each person’s share of the split. For 2:1:1, enter 2, 1 and 1.',exact:'Type how many pesos each person pays.'}[sp.mode];
  return`<div class=scrim data-act=closesheet></div><div class=panel><h3>${all?'Split every item':`Split “${esc(it.name||'this item')}”`}</h3>
<div class=seg>${modes.map(([k,l])=>`<button class="${sp.mode===k?'on':''}" data-act=mode data-k=${k}>${l}</button>`).join('')}</div>
<p class=mu><small>${hint}</small></p>
${Object.entries(mem()).map(([id,m])=>{const on=id in sp.w;return`<div class=row><button class="chip ${on?'on':''}" data-act=who data-id=${id}>${esc(m.name)}</button>${on&&sp.mode!=='equal'?`<input data-w=${id} type=number inputmode=decimal step=any value="${sp.w[id]??''}" aria-label="${esc(m.name)} share">`:''}</div>`}).join('')}
<p><small id=chk class=mu></small></p><button class="btn wide" data-act=${all?'applyall':'closesheet'}>${all?'Apply to all items':'Done'}</button></div>`};
function chk(){const el=$('#chk');if(!el||S.sheet==null)return;const sp=sheetSp(),vals=Object.values(sp.w).map(x=>+x||0),v=vals.reduce((s,x)=>s+x,0);
  el.textContent=sp.mode==='pct'?`Total: ${+v.toFixed(2)}% of 100%`:sp.mode==='shares'?`Ratio: ${vals.join(' : ')}`:sp.mode==='exact'&&S.sheet!=='all'?(it=>`Total: ${peso(Math.round(v*100))} of ${peso(Math.round(it.qty*it.price*100))}`)(S.draft.items[S.sheet]):''}
function renderSheet(){if(S.sheet==null){sheet.classList.remove('on');return}
  const first=!sheet.classList.contains('on');sheet.innerHTML=vSheet();chk();if(first){sheet.offsetHeight;sheet.classList.add('on')}}

// Live total, unassigned warning, and (for several payers) the exact-match check that unlocks Save.
function updTotals(){const d=S.draft,t=receiptTotals(d.claimMode?{...d,claims:{}}:d);$('#tot').textContent=peso(t.total);
  let ok=true;
  if(d.multi){const paid=Object.values(d.payers).reduce((s,v)=>s+Math.round((+v||0)*100),0),diff=t.total-paid;
    $('#paychk').textContent=diff===0?'Payments match the total.':diff>0?`${peso(diff)} still unpaid.`:`${peso(-diff)} too much.`;ok=diff===0&&t.total>0}
  $('#warn').textContent=!d.claimMode&&t.unassigned?`${t.unassigned} item${t.unassigned>1?'s':''} need people`:'Total';
  $('#save').disabled=!ok}
function newDraft(o={}){S.draft={title:'',tag:'Food',payer:S.me,multi:false,payers:{},claimMode:false,claims:{},items:[],tax:'',service:'',discount:'',...o};if(!S.draft.items.length)S.draft.items.push(blank())}
const rebalance=it=>{const sp=it.split,ids=Object.keys(sp.w),n=ids.length||1,t=it.qty*it.price;
  ids.forEach(id=>sp.w[id]=sp.mode==='pct'?+(100/n).toFixed(2):sp.mode==='exact'?+(t/n).toFixed(2):1)};

/* ---------- session + groups (the account code is the only thing kept on this device) ---------- */
function openGroup(code,tab='bills'){S.unsub?.();S.unsubC?.();Object.assign(S,{code,deleting:false,group:null,receipts:[],payments:[],history:[],tab,billId:null,sig:{}});
  S.unsub=F.watch(code,{
    onGroup:g=>{if(!g&&S.group&&!S.deleting){S.unsub?.();S.group=null;go('home');return toast('This group was deleted.')}
      if(same('group',g,sigGroup))return;S.group=g;mark('group')},
    onReceipts:x=>{if(!same('receipts',x)){S.receipts=x;mark('receipts')}},
    onPayments:x=>{if(!same('payments',x)){S.payments=x;mark('payments')}},
    onHistory:x=>{if(!same('history',x)){S.history=x;mark('history')}}});
  go('group')}
function startSession(code){
  S.unsubUser?.();F.stopGroups();
  Object.assign(S,{account:code,me:code,user:null,groups:{},route:'home',sig:{}});render();
  S.unsubUser=F.watchUser(code,u=>{
    const first=!S.user;if(!first&&same('user',u))return;S.user=u;same('user',u);F.watchGroups(u.joinedGroups,onGroupSnap);
    if(first){const j=S.joinCode,d=S.deep;S.joinCode=S.deep='';if(j||d)history.replaceState(null,'',location.pathname);
      if(j)doJoin(j);else if(d)u.joinedGroups.includes(d)?openGroup(d,'settle'):doJoin(d,'settle')}
    mark('user')},()=>{toast('That account no longer exists.');logout()})}
function onGroupSnap(c,data,fromCache){ // one live listener per joined group keeps the Home list in sync
  if(data){if(!same('g'+c,data,sigGroup)){S.groups[c]=data;mark('groups')}}
  else{delete S.groups[c];if(!fromCache&&S.user?.joinedGroups.includes(c))F.leaveGroup(S.account,c);mark('groups')}} // deleted by its host
function logout(){S.unsub?.();S.unsubC?.();S.unsubUser?.();F.stopGroups();localStorage.removeItem('splitable.account');
  Object.assign(S,{account:null,me:null,user:null,groups:{},route:'home',start:{step:'choose',code:''},group:null,receipts:[],payments:[],history:[],sig:{}});render()}
async function doJoin(c,tab){if(!navigator.onLine)return toast('Joining needs internet.');
  try{const name=await F.joinGroup({code:c,account:S.account,userName:S.user.name,qrData:S.user.qrData});toast(`Joined ${name}`);openGroup(c,tab)}
  catch{toast('No group found with that code.')}}
const setColor=c=>{if(!isHex(c))return;F.setTheme(S.code,c);log(`${S.user.name} changed the group color`)};
const nmsg=(t,tone)=>nudgeText({from:nm(t.from),to:nm(t.to),amt:peso(t.amt,S.group.round),tone,group:S.group.name,link:payLink(S.code)});
const billOf=()=>S.receipts.find(r=>r.id===(S.route==='edit'?S.draft?.id:S.billId));

/* ---------- summary image (3 templates, built to stay fast on phones) ---------- */
const pubHTML=(th,d)=>{const col=th==='thermal'?'#111':th==='dark'?d.colDark:d.col;
  const bars=d.cats.map(c=>`<div class=p-bar><span><span>${esc(c.tag)}</span><b>${peso(c.amt)}</b></span><div class=p-track><div class=p-fill style="width:${Math.max(4,Math.round(c.amt/d.top*100))}%;background:${col}"></div></div></div>`).join('');
  const code=th==='thermal'?`<div class=p-code>${Array.from({length:40},(_,i)=>`<i style="width:${1+(i*7%4)}px"></i>`).join('')}</div>`:'';
  return`<div class="pub ${th}"><div class=p-head style="${th==='dark'?`background:${col}`:th==='min'?`color:${col}`:''}"><small>SPLITABLE</small><h2>${esc(d.name)}</h2><p>${d.date}</p></div>
<div class=p-total><small>Total spent</small><b>${peso(d.total)}</b></div>
<div class=p-body>${d.cats.length?`<h3>WHERE IT WENT</h3>${bars}`:''}
<h3>CLEARED</h3>${d.cleared.length?d.cleared.map(n=>`<span class=p-pill style="color:${col};border-color:${col}">${esc(n)}</span>`).join(''):'<p>Nobody yet.</p>'}
<h3>PENDING</h3>${d.pending.length?d.pending.map(t=>`<div class=p-row style="border-color:inherit"><span>${esc(nm(t.from))} pays ${esc(nm(t.to))}</span><b>${peso(t.amt,d.round)}</b></div>`).join(''):'<p>All settled. Thank you!</p>'}</div>
<hr class=p-tear><div class=p-qr>${d.qr?`<img src="${d.qr}" alt="" style="border-color:${col}"><p>Scan to pay ${esc(d.host)}</p>`:`<p>Ask ${esc(d.host||'the host')} for their payment QR.</p>`}</div>${code}
<div class=p-foot>* * * THANK YOU * * *</div></div>`};

async function makeSummary(theme){
  busy(true,'Making your image…');let el;
  try{
    await timeout(needCanvas(),8000);
    const g=S.group,m=model(),busyIds=new Set(m.tr.flatMap(t=>[t.from,t.to])),hid=hostId(),cats=spendByTag(S.receipts).slice(0,5);
    el=document.createElement('div');el.className='pubwrap';
    el.innerHTML=pubHTML(theme,{name:g.name,date:new Date().toLocaleDateString('en-PH',{dateStyle:'long'}),total:S.receipts.reduce((s,r)=>s+receiptTotals(r).total,0),
      cats,top:cats[0]?.amt||1,pending:m.tr,round:g.round,col:accent(g.theme,false),colDark:accent(g.theme,true),
      cleared:Object.entries(m.L).filter(([id,x])=>id!==POT&&(x.cost||x.paid)&&!busyIds.has(id)).map(([id])=>nm(id)),host:hid?nm(hid):'',qr:hid?mem()[hid]?.qr:null}); // the QR comes from the group document: no extra network call
    document.body.append(el);
    await timeout(document.fonts.ready,1500).catch(()=>0);                                   // never wait forever for fonts
    await Promise.all([...el.querySelectorAll('img')].map(i=>i.decode?i.decode().catch(()=>0):0));
    await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,30)));                       // let the spinner paint first
    const shoot=sc=>timeout(html2canvas(el.firstElementChild,{scale:sc,backgroundColor:null,useCORS:true,logging:false,imageTimeout:4000,removeContainer:true}),sc>1?14000:20000);
    let cv;try{cv=await shoot(innerWidth<600?1.5:2)}catch{cv=await shoot(1)}                  // lower resolution is the fallback
    const bl=await new Promise(r=>cv.toBlob(r,'image/png'));
    S.pub=new File([bl],`${(g.name||'summary').replace(/[^\w]+/g,'-')}-summary.png`,{type:'image/png'});S.pubURL=URL.createObjectURL(bl);
    busy(false);
    openModal(`<h3>Your summary</h3><img class=pubprev src="${S.pubURL}" alt="Summary image preview"><div class=row2><button class=btn data-act=pubsave>Save image</button>${navigator.canShare?.({files:[S.pub]})?'<button class="btn ghost" data-act=pubshare>Share…</button>':''}</div>`);
  }catch{toast('Couldn’t make the image. Check your connection and try again.')}
  finally{el?.remove();busy(false)}}

/* ---------- actions ---------- */
const A={
  acc:b=>{const s=b.closest('.acc'),o=!s.classList.contains('open');s.classList.toggle('open',o);b.setAttribute('aria-expanded',o);S.acc[b.dataset.k]=o}, // no re-render: just a class flip
  startnew:()=>{S.start={step:'new',code:generateAccountCode()};render()},
  startback:()=>{S.start={step:'choose',code:''};render()},
  newcode:()=>{S.start.name=document.querySelector('[name=name]')?.value||'';S.start.code=generateAccountCode();render()},
  copycode:async()=>{await copy(S.account||S.start.code);toast('Account code copied')},
  logout:()=>ask('Log out?','You’ll need your account code to log back in. Make sure you’ve saved it.','Log out',logout),
  home:()=>{S.unsub?.();S.unsubC?.();go('home')},open:b=>openGroup(b.dataset.code),hm:b=>{S.hm=b.dataset.k;render()},
  tab:b=>{const k=b.dataset.k;
    if(S.route==='bill'){S.unsubC?.();S.billId=null;S.route='group';S.tab=k;render();return}
    if(S.tab===k)return;S.tab=k;nav();paintView(true);scrollTo({top:0,behavior:'smooth'})},
  theme:()=>{LS('theme',dark()?'':'dark');render()},mute:()=>{LS('mute',!LS('mute'));render()},
  invite:async()=>{await copy(inviteLink(S.code));toast(`Invite link copied. Code: ${S.code}`)},
  round:()=>{F.setRound(S.code,!S.group.round);log(`${S.user.name} turned whole-peso rounding ${S.group.round?'off':'on'}`)},
  color:b=>setColor(b.dataset.c),
  delcq:b=>{F.setClique(S.code,b.dataset.id,null);log(`${S.user.name} deleted a clique`)},
  /* bill detail */
  openbill:b=>{S.billId=b.dataset.id;S.comments=[];S.sig.comments='';S.unsubC?.();
    S.unsubC=F.watchComments(S.code,S.billId,x=>{if(!same('comments',x)){S.comments=x;mark('comments')}});go('bill')},
  billback:()=>{S.unsubC?.();S.billId=null;go('group')},
  claim:b=>{const r=billOf(),i=+b.dataset.i,id=b.dataset.id;F.setClaim(S.code,r.id,i,id,!r.claims?.[i]?.[id])},
  resolve:()=>{const r=billOf();F.setDispute(S.code,r.id,{...r.dispute,open:false});log(`${S.user.name} resolved the dispute on “${r.title}”`);toast('Marked resolved')},
  /* editor */
  newbill:()=>{newDraft();S.unfold=true;go('edit')},
  editbill:()=>{const r=structuredClone(billOf());S.unsubC?.();
    newDraft({...r,tag:r.tag||'Other',multi:!!r.payers&&Object.keys(r.payers).length>1,payers:Object.fromEntries(Object.entries(r.payers||{}).map(([k,v])=>[k,String(v)])),_orig:r.items.map(i=>({name:i.name,price:i.price}))});go('edit')},
  back:()=>{S.sheet=null;renderSheet();go('group')},
  tag:b=>{S.draft.tag=b.dataset.k;render()},
  cmode:b=>{S.draft.claimMode=b.dataset.k==='1';render()},
  multi:()=>{const d=S.draft,t=receiptTotals(d).total;d.multi=true;d.payers={[d.payer]:t?String(t/100):''};render()},
  single:()=>{const d=S.draft,k=Object.keys(d.payers).find(x=>+d.payers[x]>0);d.multi=false;if(k)d.payer=k;render()},
  additem:()=>{S.draft.items.push(blank());render()},
  rmitem:b=>{const it=S.draft.items;it.splice(+b.dataset.i,1);if(!it.length)it.push(blank());render()},
  all:()=>{const w=()=>Object.fromEntries(Object.keys(mem()).map(id=>[id,1]));S.draft.items.forEach(it=>it.split={mode:'equal',w:w()});render()},
  tog:b=>{const i=+b.dataset.i,it=S.draft.items[i],w=it.split.w,id=b.dataset.id;id in w?delete w[id]:w[id]=1;rebalance(it);S.fresh=Object.keys(w).length?i:null;render()},
  cqpick:b=>{const i=+b.dataset.i,it=S.draft.items[i],w=it.split.w,ids=S.group.cliques[b.dataset.id].members.filter(x=>mem()[x]),allIn=ids.every(x=>x in w);
    ids.forEach(x=>allIn?delete w[x]:w[x]=1);rebalance(it);S.fresh=Object.keys(w).length?i:null;render()},
  assign:b=>{S.sheet=+b.dataset.i;renderSheet()},
  splitall:()=>{S.allSplit={mode:'pct',w:Object.fromEntries(Object.keys(mem()).map(id=>[id,1]))};rebalance({split:S.allSplit,qty:1,price:0});S.sheet='all';renderSheet()},
  applyall:()=>{const sp=S.allSplit;S.draft.items.forEach(it=>it.split={mode:sp.mode,w:{...sp.w}});S.sheet=null;renderSheet();render();toast('Applied to every item')},
  who:b=>{const sp=sheetSp(),id=b.dataset.id,it=S.sheet==='all'?{split:sp,qty:1,price:0}:S.draft.items[S.sheet];id in sp.w?delete sp.w[id]:sp.w[id]=1;rebalance(it);
    if(S.sheet!=='all')S.fresh=Object.keys(sp.w).length?S.sheet:null;render();renderSheet()},
  mode:b=>{const sp=sheetSp();sp.mode=b.dataset.k;rebalance(S.sheet==='all'?{split:sp,qty:1,price:0}:S.draft.items[S.sheet]);renderSheet()},
  closesheet:()=>{S.sheet=null;renderSheet();render()},
  savebill:()=>{const d=S.draft,items=d.items.filter(i=>i.name||+i.price).map(i=>({name:i.name||'Item',qty:+i.qty||1,price:+i.price||0,split:{mode:i.split.mode,w:i.split.w}}));
    if(!items.length)return toast('Add at least one item');
    const keep={};if(d.claimMode)for(const i in d.claims||{}){const o=d._orig?.[i],n=items[i];if(!d._orig||(o&&n&&o.name===n.name&&+o.price===n.price))keep[i]=d.claims[i]} // claims survive edits to other items
    const rec={id:d.id,title:d.title||'Bill',tag:d.tag,by:d.by||S.account,payer:d.payer,payers:null,items,claimMode:d.claimMode,claims:d.claimMode?keep:null,dispute:d.dispute||null,
      tax:+d.tax||0,service:+d.service||0,discount:+d.discount||0,ts:d.ts||Date.now()};
    const t=receiptTotals(d.claimMode?{...rec,claims:{}}:rec);
    if(d.multi){rec.payers=Object.fromEntries(Object.entries(d.payers).map(([k,v])=>[k,+v||0]).filter(([,v])=>v>0));
      const paid=Object.values(rec.payers).reduce((s,v)=>s+Math.round(v*100),0);
      if(!t.total||paid!==t.total)return toast('The payments must add up to the total.');rec.payer=Object.keys(rec.payers)[0]}
    const save=()=>{F.saveReceipt(S.code,rec);log(`${S.user.name} ${d.id?'edited':'added'} “${rec.title}” for ${peso(t.total)}${d.claimMode&&!d.id?' (open for claiming)':''}`);rustle();toast('Bill saved');go('group')};
    const un=d.claimMode?0:t.unassigned;
    un?ask('Some items have nobody',`${un} item${un>1?'s are':' is'} not assigned to anyone, so the payer covers ${un>1?'them':'it'}.`,'Save anyway',save):save()},
  delbill:()=>{const r=billOf();if(!r)return;ask('Delete this bill?','Everyone’s balances will update.','Delete bill',()=>{F.delReceipt(S.code,r.id);log(`${S.user.name} deleted “${r.title}”`);S.unsubC?.();S.billId=null;go('group');toast('Bill deleted')})},
  yes:()=>{A.closemodal();const f=S.ok;S.ok=null;f?.()},
  forget:b=>{const c=b.dataset.code,g=S.groups[c];ask('Remove this group?',`“${esc(g?.name||c)}” stays for everyone else. You can rejoin with code ${c}.`,'Remove',()=>F.leaveGroup(S.account,c))},
  leave:()=>ask('Remove from your groups?',`You can rejoin any time with code ${S.code}.`,'Remove',()=>{S.unsub?.();F.leaveGroup(S.account,S.code);go('home')}),
  delgroup:()=>ask('Delete this group?','This permanently deletes every bill and payment for everyone in the group.','Delete group',()=>{S.deleting=true;S.unsub?.();S.unsubC?.();
    F.deleteGroup(S.code,{receipts:S.receipts.map(r=>r.id),payments:S.payments.map(p=>p.id),history:S.history.map(h=>h.id),account:S.account});go('home');toast('Group deleted')}),
  closemodal:()=>modal.classList.remove('on'),
  /* money */
  contrib:()=>openModal(`<h3>Add to the group fund</h3><label>Amount<input id=fundamt type=number inputmode=decimal step=any min=0 placeholder="500" autofocus></label><p class=mu><small>Hand the cash to whoever holds the fund, or send it to the host’s QR. This records your contribution.</small></p><button class="btn wide" data-act=contribgo>Add to fund</button>`),
  contribgo:()=>{const v=Math.round((+$('#fundamt').value||0)*100);if(v<=0)return toast('Enter an amount.');
    F.recordPayment(S.code,{from:S.me,to:POT,amt:v});log(`${S.user.name} added ${peso(v)} to the group fund`);ding();A.closemodal();toast('Added to the fund')},
  settleup:b=>{const t=S.tr[b.dataset.i],w=S.group.round,toFund=t.to===POT,fromFund=t.from===POT;S.pay=t;
    const qr=fromFund?null:toFund?mem()[hostId()]?.qr:mem()[t.to]?.qr; // the receiver’s QR comes straight from the shared group document
    const who=toFund?'the group fund':nm(t.to);
    openModal(`<h3>${fromFund?'Pay out from':'Pay'} ${esc(fromFund?nm(t.to):who)}</h3><p class=mu><small>${esc(nm(t.from))} ${fromFund?'pays':'owes'}</small></p><p class=amtbig>${peso(t.amt,w)}</p>
<label>Amount now<input id=payamt type=number inputmode=decimal step=any min=0 value="${(t.amt/100).toFixed(2)}"></label>
<p class=mu><small>Paying only part of it? Change the amount. The rest stays on the balance.</small></p>
${qr?`<img class=qr src="${qr}" alt="Payment QR for ${esc(who)}"><p class=mu><small>Scan with GCash, Maya or your bank app, then record the payment.</small></p>`
:`<p class=mu>${fromFund?'The fund holder sends this by GCash, Maya or cash.':`${esc(toFund?(hostId()?nm(hostId()):'The host'):nm(t.to))} hasn’t added a payment QR yet. They can add one under Group.`}</p>`}
<button class="btn wide" data-act=paid>Record payment</button>`)},
  paid:()=>{const t=S.pay,w=S.group.round,v=Math.round((+$('#payamt').value||0)*100);
    if(v<=0)return toast('Enter an amount.');if(v>t.amt)return toast(`That’s more than ${peso(t.amt,w)}.`);
    F.recordPayment(S.code,{from:t.from,to:t.to,amt:v});log(`${S.user.name} recorded ${peso(v)} from ${nm(t.from)} to ${nm(t.to)}`);
    ding();A.closemodal();toast(v<t.amt?`Partial payment saved. ${peso(t.amt-v,w)} left.`:'Payment recorded')},
  undopay:b=>{const p=S.payments.find(x=>x.id===b.dataset.id);if(!p)return;
    ask('Undo this payment?',`${esc(nm(p.from))} paid ${esc(nm(p.to))} ${peso(p.amt)}. The balance goes back up.`,'Undo',()=>{F.delPayment(S.code,p.id);log(`${S.user.name} undid a ${peso(p.amt)} payment from ${nm(p.from)} to ${nm(p.to)}`)})},
  nudge:b=>{const t=S.tr[b.dataset.i];S.nd=t;
    openModal(`<h3>Nudge ${esc(nm(t.from))}</h3><div class=seg>${['funny','gentle','dramatic'].map((k,i)=>`<button class="${i?'':'on'}" data-act=tone data-k=${k}>${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div>
<textarea id=nt rows=6>${esc(nmsg(t,'funny'))}</textarea>
<div class=row2><button class=btn data-act=copynudge>Copy</button>${navigator.share?'<button class="btn ghost" data-act=sharenudge>Share…</button>':''}</div>
<p class=mu><small>Paste it into Messenger, or tap Share and pick Messenger. The link opens this group’s Settle tab.</small></p>`)},
  tone:b=>{$('#nt').value=nmsg(S.nd,b.dataset.k);modal.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b))},
  copynudge:async()=>{await copy($('#nt').value);toast('Copied. Paste it into Messenger.')},
  sharenudge:()=>navigator.share({text:$('#nt').value}).catch(()=>{}),
  roulette:()=>{const ids=Object.keys(mem()),n=ids.length,seg=360/n;
    const bg=ids.map((_,i)=>`hsl(${i*360/n} 30% ${i%2?84:74}%) ${i*seg}deg ${(i+1)*seg}deg`).join(',');
    openModal(`<h3>Bill roulette</h3><p class=mu><small>Spin to pick who pays for a shared item, tip or delivery fee.</small></p><div class=wheelwrap><i class=pin></i><div class=wheel id=wheel style="background:conic-gradient(${bg})">${ids.map((id,i)=>`<span style="transform:rotate(${(i+.5)*seg}deg) translate(-50%,-92px)">${esc(nm(id))}</span>`).join('')}</div></div><p class=amtbig id=win>&nbsp;</p><button class="btn wide" data-act=spin>Spin</button>`)},
  spin:b=>{const ids=Object.keys(mem()),n=ids.length,seg=360/n,w=Math.floor(Math.random()*n),el=$('#wheel'),cur=el._r||0;
    const to=cur-(cur%360)+360*5+(360-(w*seg+seg/2));el._r=to;el.style.transform=`rotate(${to}deg)`;b.disabled=true;$('#win').textContent='…';
    for(let i=0;i<14;i++)setTimeout(click,i*i*20);
    setTimeout(()=>{$('#win').textContent=nm(ids[w])+' pays!';ding();b.disabled=false;b.textContent='Spin again'},4100)},
  /* summary image */
  summarypick:()=>{const cur=LS('pubTheme')||'min';
    openModal(`<h3>Choose a style</h3><div class=tpls>${[['min','Minimalist','Clean and light'],['dark','Dark mode','Bold and moody'],['thermal','Thermal receipt','Like a real printout']].map(([k,n,d])=>`<button class="tpl ${k} ${cur===k?'on':''}" data-act=gen data-t=${k}><i class=tp></i><span><b>${n}</b><small>${d}</small></span></button>`).join('')}</div>`)},
  gen:b=>{const t=b.dataset.t;LS('pubTheme',t);A.closemodal();makeSummary(t)},
  pubsave:()=>{const a=document.createElement('a');a.href=S.pubURL;a.download=S.pub.name;a.click()},
  pubshare:()=>navigator.share({files:[S.pub],title:S.group.name}).catch(()=>{})
};

/* ---------- events ---------- */
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;click();A[b.dataset.act]?.(b)});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,fd=new FormData(f),d=Object.fromEntries(fd),k=f.dataset.form;click();
  const offline=()=>toast('Couldn’t reach the server. Check your connection.');
  if(k==='login'){const c=normalizeCode(d.code);if(!isAccountCode(c))return toast('Codes are 6 letters and numbers.');
    try{if(!await F.getUser(c))return toast('No account with that code.');LS('account',c);startSession(c)}catch{offline()}}
  if(k==='signup'){const name=d.name.trim(),c=S.start.code;if(!name)return;
    try{if(!await F.createUser(c,name)){S.start.code=generateAccountCode();S.start.name=name;render();return toast('That code was taken. Here’s a new one to save.')}
      LS('account',c);startSession(c);toast('Account created')}catch{offline()}}
  if(k==='create')openGroup(F.createGroup({name:d.name.trim(),type:d.type,account:S.account,userName:S.user.name,qrData:S.user.qrData}));
  if(k==='join')doJoin(d.code.trim());
  if(k==='guest'){const n=d.name.trim();F.addGuest(S.code,n);log(`${S.user.name} added guest ${n}`);f.reset();toast('Guest added')}
  if(k==='clique'){const ids=fd.getAll('m');if(!ids.length)return toast('Pick at least one member.');
    F.setClique(S.code,'c_'+generateAccountCode(5).toLowerCase(),{name:d.name.trim(),members:ids});log(`${S.user.name} created the clique “${d.name.trim()}”`);f.reset();toast('Clique saved')}
  if(k==='comment'){const r=billOf(),text=d.text.trim();if(!text)return;
    F.addComment(S.code,r.id,{by:S.account,byName:S.user.name,text,dispute:!!d.dispute});
    if(d.dispute){F.setDispute(S.code,r.id,{open:true,by:S.account,byName:S.user.name,ts:Date.now()});log(`${S.user.name} flagged a dispute on “${r.title}”`)}
    f.reset();toast(d.dispute?'Dispute flagged':'Comment sent')}});
document.addEventListener('input',e=>{const t=e.target,d=S.draft;if(t.classList.contains('codein'))t.value=normalizeCode(t.value);if(S.route!=='edit'||!d)return;
  if(t.dataset.f){d[t.dataset.f]=t.value;updTotals()}
  else if(t.dataset.k){d.items[t.dataset.i][t.dataset.k]=t.value;updTotals()}
  else if(t.dataset.pay!=null){d.payers[t.dataset.pay]=t.value;updTotals()}
  else if(t.dataset.w!=null&&S.sheet!=null){sheetSp().w[t.dataset.w]=t.value;chk();updTotals()}});
document.addEventListener('change',e=>{const t=e.target,f=t.files?.[0];
  if(t.id==='gcolor')setColor(t.value);
  if(t.id==='qr'&&f){toast('Saving QR…');
    shrink(f).then(img=>{ // copy the QR into every group you belong to, so everyone there can read it from the group document
      F.saveQR(S.account,img,S.user.joinedGroups.filter(c=>S.groups[c]?.members?.[S.account]));S.user.qrData=img;S.sig.user='';paintView();toast('QR saved')}).catch(()=>toast('Couldn’t read that image.'))}});

/* ---------- start ---------- */
Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k)); // leftovers from old versions
applyTheme();net();addEventListener('online',net);addEventListener('offline',net);
const j=location.hash.match(/join\/(\d{6})/),dl=location.hash.match(/#\/g\/(\d{6})/);
if(j){S.joinCode=j[1];S.hm='join'}if(dl)S.deep=dl[1];
const saved=LS('account');
if(saved&&isAccountCode(saved))startSession(saved);else render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
