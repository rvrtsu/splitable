import*as F from'./firebase.js';
import{receiptTotals,ledger,balances,settle,peso,nudgeText,inviteLink,payLink,generateAccountCode,normalizeCode,isAccountCode,TAGS,TAG_COLORS,spendByTag,pieSlices,accent,isHex,GROUP_COLORS}from'./logic.js';

const $=s=>document.querySelector(s),app=$('#app'),sheet=$('#sheet'),modal=$('#modal');
const LS=(k,v)=>v===undefined?JSON.parse(localStorage.getItem('splitable.'+k)||'null'):localStorage.setItem('splitable.'+k,JSON.stringify(v));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>'&#'+m.charCodeAt(0)+';');
const S={route:'home',hm:'new',tab:'bills',start:{step:'choose',code:''},account:null,user:null,groups:{},
  code:null,me:null,group:null,receipts:[],payments:[],history:[],tr:[],draft:null,sheet:null};
const mem=()=>S.group?.members||{},nm=id=>mem()[id]?.name||'Someone',onoff=v=>v?'On':'Off';
const dark=()=>LS('theme')==='dark';
const blank=()=>({name:'',qty:1,price:'',split:{mode:'equal',w:{}}});
const typing=()=>document.activeElement?.matches('input:not([type=color]):not([type=checkbox]),select');

/* sounds: synthesized, so there are no audio files to load */
let ac;const ctx=()=>ac??=new AudioContext();
const tone=(f,d,t='sine',v=.06,at=0)=>{if(LS('mute'))return;const x=ctx(),o=x.createOscillator(),g=x.createGain(),s=x.currentTime+at;
  o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,s);g.gain.exponentialRampToValueAtTime(.0001,s+d);o.connect(g).connect(x.destination);o.start(s);o.stop(s+d)};
const click=()=>tone(1400,.03,'square',.02),ding=()=>{tone(1568,.5,'sine',.08);tone(2093,.7,'sine',.05,.08)};
const rustle=()=>{if(LS('mute'))return;const x=ctx(),n=x.sampleRate*.35,b=x.createBuffer(1,n,x.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n)**2;const s=x.createBufferSource(),f=x.createBiquadFilter(),g=x.createGain();
  f.type='highpass';f.frequency.value=2500;g.gain.value=.15;s.buffer=b;s.connect(f).connect(g).connect(x.destination);s.start()};

/* helpers */
let tt;const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2800)};
const copy=async s=>{try{await navigator.clipboard.writeText(s)}catch{const a=document.createElement('textarea');a.value=s;document.body.append(a);a.select();document.execCommand('copy');a.remove()}};
const net=()=>document.body.classList.toggle('off',!navigator.onLine);
const openModal=h=>{modal.innerHTML=`<div class=scrim data-act=closemodal></div><div class=card>${h}</div>`;modal.offsetHeight;modal.classList.add('on')};
const ask=(title,text,label,fn)=>{S.ok=fn;openModal(`<h3>${title}</h3><p class=mu>${text}</p><div class=row2 style="margin-top:12px"><button class="btn ghost" data-act=closemodal>Cancel</button><button class="btn danger" data-act=yes>${label}</button></div>`)};
const when=ts=>new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const log=text=>F.logEvent(S.code,{by:S.account,byName:S.user.name,text});
const payersText=r=>(r.payers&&Object.keys(r.payers).length?Object.keys(r.payers):[r.payer]).map(nm).join(', ');
function applyTheme(){ // dark mode, plus the open group's color
  const t=LS('theme')||'';document.documentElement.dataset.theme=t;document.querySelector('meta[name=theme-color]').content=t?'#242220':'#F9F6F0';
  const inGroup=S.account&&(S.route==='group'||S.route==='edit')&&S.group?.theme;
  inGroup?document.documentElement.style.setProperty('--gc',accent(S.group.theme,dark())):document.documentElement.style.removeProperty('--gc')}
async function shrink(file,max=640){ // payment QR becomes a small picture saved in Firestore
  const b=await createImageBitmap(file),s=Math.min(1,max/Math.max(b.width,b.height)),cv=document.createElement('canvas');
  cv.width=Math.round(b.width*s);cv.height=Math.round(b.height*s);const x=cv.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(b,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',.85)}
const needCanvas=()=>window.html2canvas?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=ok;s.onerror=no;document.head.append(s)});

/* views: start + home */
const vSettings=()=>`<div class=paper><h3>App settings</h3>
<div class=row><span>Dark mode</span><button class="btn ghost sm" data-act=theme>${onoff(dark())}</button></div>
<div class=row style="margin-top:10px"><span>Sounds</span><button class="btn ghost sm" data-act=mute>${onoff(!LS('mute'))}</button></div></div>`;

const vStart=()=>{const s=S.start;
  const invite=S.joinCode?`<div class=paper><small>You’re invited to group <b>${S.joinCode}</b>. Log in or create an account and you’ll join automatically.</small></div>`:'';
  if(s.step==='new')return`<div class=hdr><button class="btn ghost sm" data-act=startback>← Back</button><h2>Your account code</h2></div>${invite}
<div class=paper><div class=codebox>${s.code}</div><div class=row2><button class="btn ghost" data-act=copycode>Copy code</button><button class="btn ghost" data-act=newcode>Make another</button></div>
<p class=mu><small>This code is your login. Save it in your notes or send it to yourself. Anyone who has it can open your account, and it can’t be recovered.</small></p></div>
<form class=paper data-form=signup><label>Your name<input name=name maxlength=40 autocomplete=given-name placeholder="Maria" value="${esc(s.name||'')}" required></label>
<label class=check><input type=checkbox required> I’ve saved my code</label><button class="btn wide">Create account</button></form>`;
  return`<h1>Splitable</h1><p class=mu>Split any bill fairly. Your account is a 6-character code, with no email or password.</p>${invite}
<div class=paper><h3>New here?</h3><p class=mu><small>We’ll make you a personal code.</small></p><button class="btn wide" data-act=startnew>Create my account</button></div>
<div class=paper><h3>Already have a code?</h3><form data-form=login><label>Account code<input class=codein name=code maxlength=6 autocapitalize=characters autocomplete=off spellcheck=false placeholder="K7M2QX" required></label><button class="btn wide">Log in</button></form></div>${vSettings()}`};

const vHome=()=>{if(!S.user)return'<p class=mu>Loading your account…</p>';
  const ids=S.user.joinedGroups||[],n=S.hm==='new';
  return`<h1 style="font-size:28px">Hi, ${esc(S.user.name)}</h1>
<div class="paper row"><span><small class=mu>Your account code</small><br><b class=code>${S.account}</b></span><button class="btn ghost sm" data-act=copycode>Copy</button></div>
${ids.length?`<h3 class=sec>Your groups</h3><div class=grid>${ids.map(c=>{const g=S.groups[c];return`<div class="paper row gcard" style="--gc:${accent(g?.theme,dark())}"><button class=gopen data-act=open data-code=${c}><b>${g?esc(g.name):'Loading…'}</b><br><small class=mu>Code ${c}${g?`, ${Object.keys(g.members).length} members`:''}</small></button><button class=lnk data-act=forget data-code=${c}>Remove</button></div>`}).join('')}</div>`:'<p class=mu>No groups yet. Create one or join with a code.</p>'}
<div class=paper><div class=seg><button class="${n?'on':''}" data-act=hm data-k=new>New group</button><button class="${n?'':'on'}" data-act=hm data-k=join>Join a group</button></div>
${n?`<form data-form=create>
<label>Group name<input name=name placeholder="Friday dinner" required></label>
<label>Group type<select name=type><option value=once>One-time: a single outing</option><option value=ongoing>Ongoing: roommates or regular friends</option></select></label>
<button class="btn wide">Create group</button></form>`
:`<form data-form=join>
<label>6-digit group code<input name=code inputmode=numeric maxlength=6 pattern="\\d{6}" value="${S.joinCode||''}" placeholder="123456" required></label>
<button class="btn wide">Join group</button></form>`}</div>${vSettings()}
<div class=paper><h3>Account</h3><p class=mu><small>Log in with your code on any device and your groups appear automatically.</small></p><button class="btn ghost wide" data-act=logout>Log out</button></div>`};

/* views: group tabs */
const vBills=closed=>`${closed?'<div class=stamp>All paid</div>':'<button class="btn wide" data-act=newbill>+ Add a bill</button>'}
${S.receipts.length?`<h3 class=sec>Bills</h3><div class=grid>${S.receipts.map(r=>`<button class="paper bill full" data-act=editbill data-id=${r.id}><b>${esc(r.title)}</b><b>${peso(receiptTotals(r).total)}</b><small class=mu>${esc(r.tag||'Other')}, paid by ${esc(payersText(r))}, ${r.items.length} item${r.items.length===1?'':'s'}</small></button>`).join('')}</div>`
:`<div class=paper><h3>How it works</h3><ol class=steps><li>Add a bill and type in the items.</li><li>Tap the names of who shared each item.</li><li>Open Settle to see who pays whom.</li></ol></div>`}`;

const vPie=()=>{const d=spendByTag(S.receipts);if(!d.length)return'';const sl=pieSlices(d),tot=d.reduce((s,x)=>s+x.amt,0);
  return`<h3 class=sec>Spending breakdown</h3><div class=paper><div class=pie>
<svg viewBox="0 0 140 140" role=img aria-label="Spending by category">${sl.map(s=>s.full?`<circle cx=70 cy=70 r=64 fill="${TAG_COLORS[s.tag]}"/>`:`<path d="${s.d}" fill="${TAG_COLORS[s.tag]}" stroke="var(--card)" stroke-width=2 />`).join('')}</svg>
<ul class=legend>${sl.map(s=>`<li><i class=dot style="background:${TAG_COLORS[s.tag]}"></i><span>${esc(s.tag)}</span><b>${peso(s.amt)}</b><small class=mu>${s.pct}%</small></li>`).join('')}</ul></div>
<p class=mu><small>Total spent ${peso(tot)}</small></p></div>`};

const vSettle=tr=>{const w=S.group.round,has=S.receipts.length,L=ledger(S.receipts,S.payments);
  const head=!has?'Add a bill first, then come back here.':tr.length?`${tr.length} payment${tr.length>1?'s':''} settle${tr.length>1?'':'s'} everything`:'Everyone is settled up';
  const paid=S.payments.slice().sort((a,b)=>b.ts-a.ts).slice(0,5);
  return`<h3 class=sec>${head}</h3>
<div class=grid>${tr.map((t,i)=>`<div class=paper><div class=tx><span><b>${esc(nm(t.from))}</b> pays <b>${esc(nm(t.to))}</b></span><b class=amt>${peso(t.amt,w)}</b></div>
<div class=row2><button class=btn data-act=settleup data-i=${i}>Pay</button><button class="btn ghost" data-act=nudge data-i=${i}>Nudge</button></div></div>`).join('')}</div>
${has?`<h3 class=sec>Everyone’s share</h3><div class=paper>${Object.entries(L).map(([id,m])=>{const b=m.balance;
  return`<div class=who2><span>${esc(nm(id))}<small class=mu>Share ${peso(m.cost)}, paid ${peso(m.paid+m.sent-m.got)}</small></span><span class=owe>${b>0?`owes ${peso(b)}`:b<0?`is owed ${peso(-b)}`:'settled'}</span></div>`}).join('')}</div>`:''}
${paid.length?`<h3 class=sec>Recent payments</h3><div class=paper>${paid.map(p=>`<div class=who2><span>${esc(nm(p.from))} paid ${esc(nm(p.to))}<small class=mu>${when(p.ts)}</small></span><span class=owe>${peso(p.amt)}<br><button class=lnk data-act=undopay data-id=${p.id}>Undo</button></span></div>`).join('')}</div>`:''}
${vPie()}
${has?`<div class=paper><div class=row><span>Round to whole pesos<br><small class=mu>Skips the centavos</small></span><button class="btn ghost sm" data-act=round>${onoff(w)}</button></div></div>
<h3 class=sec>Extras</h3><div class=row2><button class="btn ghost" data-act=summary>Generate summary</button><button class="btn ghost" data-act=roulette>Bill roulette</button></div>`:''}`};

const vHistory=()=>`<h3 class=sec>Activity</h3>${S.history.length?`<div class=paper>${S.history.map(h=>`<div class=logrow><span>${esc(h.text)}</span><small class=mu>${when(h.ts)}</small></div>`).join('')}</div>`
:'<p class=mu>Nothing here yet. Every change to the group shows up here.</p>'}`;

const vPeople=()=>{const cur=S.group.theme||'#3E2723';return`<h3 class=sec>Members</h3>
${Object.entries(mem()).map(([id,m])=>`<div class="paper row"><span>${esc(m.name)}${id===S.me?' (you)':''}</span>${m.guest?'<small class=mu>Guest</small>':m.host?'<small class=mu>Host</small>':''}</div>`).join('')}
<form class=paper data-form=guest><h3>Add a guest</h3><p class=mu><small>For a friend without the app. You keep track of what they owe.</small></p><div class=row><input name=name placeholder="Guest’s name" required><button class="btn sm">Add</button></div></form>
<div class=paper><h3>Group color</h3><p class=mu><small>Shows on Home so you can tell groups apart.</small></p><div class=swatches>
${GROUP_COLORS.map(([n,c])=>`<button class="sw ${cur.toLowerCase()===c.toLowerCase()?'on':''}" style="background:${accent(c,dark())}" data-act=color data-c="${c}" aria-label="${n}"></button>`).join('')}
<label class="sw cust" aria-label="Pick a custom color"><input type=color id=gcolor value="${isHex(cur)?cur:'#3E2723'}"></label></div></div>
<div class=paper><h3>Your payment QR</h3><p class=mu><small>Friends see it when they tap Pay. Use your GCash, Maya or bank QR.</small></p>
${S.user?.qrData?`<img class=qr src="${S.user.qrData}" alt="Your payment QR">`:''}
<label class="btn ghost wide" for=qr style="margin:12px 0 0">${S.user?.qrData?'Replace QR':'Upload QR'}</label><input id=qr type=file accept="image/*" hidden></div>
<div class=paper><h3>Group options</h3>${mem()[S.me]?.host?'<p class=mu><small>Deleting removes every bill and payment for everyone in the group.</small></p><button class="btn danger wide" data-act=delgroup>Delete group</button>':'<p class=mu><small>This only removes the group from your account. You can rejoin with the code.</small></p><button class="btn ghost wide" data-act=leave>Remove from my groups</button>'}</div>
${vSettings()}`};

const vGroup=()=>{const g=S.group;if(!g)return'<p class=mu>Loading group…</p>';
  const tr=settle(balances(S.receipts,S.payments),g.round);S.tr=tr;
  const closed=g.type==='once'&&S.receipts.length>0&&!tr.length;
  const body={bills:()=>vBills(closed),settle:()=>vSettle(tr),history:vHistory,people:vPeople}[S.tab]();
  return`<div class=hdr><button class="btn ghost sm" data-act=home>← Groups</button><h2>${esc(g.name)}<small class=mu>Code ${S.code}</small></h2><button class="btn sm" data-act=invite>Invite</button></div>
${body}
<nav class=tabs>${[['bills','Bills'],['settle','Settle'],['history','History'],['people','People']].map(([k,l])=>`<button class="tab ${S.tab===k?'on':''}" data-act=tab data-k=${k}>${l}</button>`).join('')}</nav>`};

/* views: bill editor */
const itemRow=(it,i)=>{const w=it.split.w,m=it.split.mode;
  return`<div class="item ${Object.keys(w).length?'assigned':''} ${S.fresh===i?'fresh':''}"><div class=iline>
<input class=nmi data-i=${i} data-k=name value="${esc(it.name)}" placeholder="Item name" aria-label="Item name">
<input class=qty data-i=${i} data-k=qty type=number inputmode=numeric min=1 value="${it.qty}" aria-label=Quantity>
<input class=prc data-i=${i} data-k=price type=number inputmode=decimal step=any placeholder="0" value="${it.price}" aria-label="Price each">
<button class=xb data-act=rmitem data-i=${i} aria-label="Remove item">✕</button></div>
<div class=who>${Object.entries(mem()).map(([id,mm])=>`<button class="chip ${id in w?'on':''}" data-act=tog data-i=${i} data-id=${id}>${esc(mm.name)}</button>`).join('')}
<button class=lnk data-act=assign data-i=${i}>${m==='equal'?'Custom split':m==='pct'?'Edit % split':'Edit ₱ split'}</button></div></div>`};

const vPayers=d=>d.multi?`<h3>Who paid, and how much?</h3>
${Object.entries(mem()).map(([id,m])=>`<div class=row style="margin-bottom:6px"><span>${esc(m.name)}</span><input data-pay=${id} type=number inputmode=decimal step=any placeholder="0" value="${esc(d.payers[id]??'')}" style="width:110px;text-align:right" aria-label="${esc(m.name)} paid"></div>`).join('')}
<p><small id=paychk class=mu></small></p><button class=lnk data-act=single>One person paid instead</button>`
:`<label>Who paid the bill?<select data-f=payer>${Object.entries(mem()).map(([id,m])=>`<option value=${id} ${id===d.payer?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>
<button class=lnk data-act=multi>Multiple people paid</button>`;

const vEdit=()=>{const d=S.draft;
  return`<div class=hdr><button class="btn ghost sm" data-act=back>← Back</button><h2>${d.id?'Edit bill':'New bill'}</h2>${d.id?'<button class="btn ghost sm danger-t" data-act=delbill>Delete</button>':''}</div>
<div class=paper><label>What was it for?<input data-f=title placeholder="Dinner at Mang Inasal" value="${esc(d.title)}"></label>
<small class=mu>Category</small><div class=who style="margin:4px 0 14px">${TAGS.map(t=>`<button class="chip ${d.tag===t?'on':''}" data-act=tag data-k=${t}>${t}</button>`).join('')}</div>
${vPayers(d)}</div>
<div class="paper ${S.unfold?'unfold':''}"><div class=row><h3>Items</h3><button class=lnk data-act=all>Everyone shares all</button></div>
<div class=cols><span class=nmi>Item</span><span class=qty>Qty</span><span class=prc>Price each</span><span class=xb></span></div>
${d.items.map(itemRow).join('')}<button class="btn ghost" data-act=additem>+ Add item</button></div>
<div class=paper><h3>Tax and fees</h3><p class=mu><small>Shared in proportion to what each person ordered.</small></p>
${[['tax','Tax'],['service','Service charge'],['discount','Discount']].map(([k,l])=>`<div class=row style="margin-top:8px"><span>${l}</span><input data-f=${k} type=number inputmode=decimal step=any placeholder="0" value="${d[k]||''}" style="width:110px;text-align:right" aria-label="${l}"></div>`).join('')}</div>
${d.id?'<button class="btn ghost wide danger-t" data-act=delbill>Delete this bill</button>':''}
<div class=bar><div><small class=mu id=warn>&nbsp;</small><b id=tot></b></div><button class=btn id=save data-act=savebill>Save bill</button></div>`};

const vSheet=()=>{const it=S.draft.items[S.sheet],sp=it.split,hint={equal:'Everyone you pick pays the same amount.',pct:'Type each person’s percent. For 70/30, enter 70 and 30.',exact:'Type how many pesos each person pays.'}[sp.mode];
  return`<div class=scrim data-act=closesheet></div><div class=panel><h3>Split “${esc(it.name||'this item')}”</h3>
<div class=seg>${[['equal','Equal'],['pct','By percent'],['exact','By amount']].map(([k,l])=>`<button class="${sp.mode===k?'on':''}" data-act=mode data-k=${k}>${l}</button>`).join('')}</div>
<p class=mu><small>${hint}</small></p>
${Object.entries(mem()).map(([id,m])=>{const on=id in sp.w;return`<div class=row><button class="chip ${on?'on':''}" data-act=who data-id=${id}>${esc(m.name)}</button>${on&&sp.mode!=='equal'?`<input data-w=${id} type=number inputmode=decimal step=any value="${sp.w[id]??''}" aria-label="${esc(m.name)} share">`:''}</div>`}).join('')}
<p><small id=chk class=mu></small></p><button class="btn wide" data-act=closesheet>Done</button></div>`};

function chk(){const el=$('#chk');if(!el||S.sheet==null)return;const it=S.draft.items[S.sheet],sp=it.split,v=Object.values(sp.w).reduce((s,x)=>s+(+x||0),0);
  el.textContent=sp.mode==='pct'?`Total: ${+v.toFixed(2)}% of 100%`:sp.mode==='exact'?`Total: ${peso(Math.round(v*100))} of ${peso(Math.round(it.qty*it.price*100))}`:''}
function renderSheet(){if(S.sheet==null){sheet.classList.remove('on');return}
  const first=!sheet.classList.contains('on');sheet.innerHTML=vSheet();chk();if(first){sheet.offsetHeight;sheet.classList.add('on')}}
function render(){applyTheme();if(!S.account){app.innerHTML=vStart();return}
  app.innerHTML=S.route==='home'?vHome():S.route==='edit'?vEdit():vGroup();
  if(S.route==='edit')updTotals();S.fresh=null;S.unfold=false}
const go=r=>{S.route=r;render();scrollTo(0,0)};

// Live total, unassigned warning, and (for several payers) the exact-match check that unlocks Save.
function updTotals(){const d=S.draft,t=receiptTotals(d);$('#tot').textContent=peso(t.total);
  let ok=true;
  if(d.multi){const paid=Object.values(d.payers).reduce((s,v)=>s+Math.round((+v||0)*100),0),diff=t.total-paid;
    $('#paychk').textContent=diff===0?'Payments match the total.':diff>0?`${peso(diff)} still unpaid.`:`${peso(-diff)} too much.`;ok=diff===0&&t.total>0}
  $('#warn').textContent=t.unassigned?`${t.unassigned} item${t.unassigned>1?'s':''} need people`:'Total';
  $('#save').disabled=!ok}

function newDraft(o={}){S.draft={title:'',tag:'Food',payer:S.me,multi:false,payers:{},items:[],tax:'',service:'',discount:'',...o};if(!S.draft.items.length)S.draft.items.push(blank())}
const rebalance=it=>{const sp=it.split,ids=Object.keys(sp.w),n=ids.length||1,t=it.qty*it.price;
  ids.forEach(id=>sp.w[id]=sp.mode==='equal'?1:+(sp.mode==='pct'?100/n:t/n).toFixed(2))};

/* group + account session (the account code is the only thing kept on this device) */
function openGroup(code,tab='bills'){S.unsub?.();Object.assign(S,{code,deleting:false,group:null,receipts:[],payments:[],history:[],tab});
  const r=()=>{if(S.route==='group'&&!typing())render()};
  S.unsub=F.watch(code,{onGroup:g=>{if(!g&&S.group&&!S.deleting){S.unsub?.();S.group=null;go('home');return toast('This group was deleted.')}S.group=g;r()},
    onReceipts:x=>{S.receipts=x;r()},onPayments:x=>{S.payments=x;r()},onHistory:x=>{S.history=x;r()}});go('group')}
const rh=()=>{if(S.route==='home'&&!typing())render()};
function startSession(code){
  S.unsubUser?.();F.stopGroups();
  Object.assign(S,{account:code,me:code,user:null,groups:{},route:'home'});render();
  S.unsubUser=F.watchUser(code,u=>{
    const first=!S.user;S.user=u;F.watchGroups(u.joinedGroups,onGroupSnap);
    if(first){const j=S.joinCode,d=S.deep;S.joinCode=S.deep='';if(j||d)history.replaceState(null,'',location.pathname);
      if(j)doJoin(j);else if(d)u.joinedGroups.includes(d)?openGroup(d,'settle'):doJoin(d,'settle')}
    rh()},()=>{toast('That account no longer exists.');logout()})}
function onGroupSnap(c,data,fromCache){ // one live listener per joined group keeps the Home list in sync
  if(data)S.groups[c]=data;
  else{delete S.groups[c];if(!fromCache&&S.user?.joinedGroups.includes(c))F.leaveGroup(S.account,c)} // deleted by its host
  rh()}
function logout(){S.unsub?.();S.unsubUser?.();F.stopGroups();localStorage.removeItem('splitable.account');
  Object.assign(S,{account:null,me:null,user:null,groups:{},route:'home',start:{step:'choose',code:''},group:null,receipts:[],payments:[],history:[]});render()}
async function doJoin(c,tab){if(!navigator.onLine)return toast('Joining needs internet.');
  try{const name=await F.joinGroup({code:c,account:S.account,userName:S.user.name,qrData:S.user.qrData});toast(`Joined ${name}`);openGroup(c,tab)}
  catch{toast('No group found with that code.')}}
const setColor=c=>{if(!isHex(c))return;F.setTheme(S.code,c);log(`${S.user.name} changed the group color`)};
const nmsg=(t,tone)=>nudgeText({from:nm(t.from),to:nm(t.to),amt:peso(t.amt,S.group.round),tone,group:S.group.name,link:payLink(S.code)});

/* actions */
const A={
  startnew:()=>{S.start={step:'new',code:generateAccountCode()};render()},
  startback:()=>{S.start={step:'choose',code:''};render()},
  newcode:()=>{S.start.name=document.querySelector('[name=name]')?.value||'';S.start.code=generateAccountCode();render()},
  copycode:async()=>{await copy(S.account||S.start.code);toast('Account code copied')},
  logout:()=>ask('Log out?','You’ll need your account code to log back in. Make sure you’ve saved it.','Log out',logout),
  home:()=>{S.unsub?.();go('home')},open:b=>openGroup(b.dataset.code),hm:b=>{S.hm=b.dataset.k;render()},
  tab:b=>{S.tab=b.dataset.k;render()},
  theme:()=>{LS('theme',dark()?'':'dark');render()},mute:()=>{LS('mute',!LS('mute'));render()},
  invite:async()=>{await copy(inviteLink(S.code));toast(`Invite link copied. Code: ${S.code}`)},
  round:()=>{F.setRound(S.code,!S.group.round);log(`${S.user.name} turned whole-peso rounding ${S.group.round?'off':'on'}`)},
  color:b=>setColor(b.dataset.c),
  newbill:()=>{newDraft();S.unfold=true;go('edit')},
  editbill:b=>{const r=structuredClone(S.receipts.find(x=>x.id===b.dataset.id));
    newDraft({...r,tag:r.tag||'Other',multi:!!r.payers&&Object.keys(r.payers).length>1,payers:Object.fromEntries(Object.entries(r.payers||{}).map(([k,v])=>[k,String(v)]))});go('edit')},
  back:()=>{S.sheet=null;renderSheet();go('group')},
  tag:b=>{S.draft.tag=b.dataset.k;render()},
  multi:()=>{const d=S.draft,t=receiptTotals(d).total;d.multi=true;d.payers={[d.payer]:t?String(t/100):''};render()},
  single:()=>{const d=S.draft,k=Object.keys(d.payers).find(x=>+d.payers[x]>0);d.multi=false;if(k)d.payer=k;render()},
  additem:()=>{S.draft.items.push(blank());render()},
  rmitem:b=>{const it=S.draft.items;it.splice(+b.dataset.i,1);if(!it.length)it.push(blank());render()},
  all:()=>{const w=()=>Object.fromEntries(Object.keys(mem()).map(id=>[id,1]));S.draft.items.forEach(it=>it.split={mode:'equal',w:w()});render()},
  tog:b=>{const i=+b.dataset.i,it=S.draft.items[i],w=it.split.w,id=b.dataset.id;id in w?delete w[id]:w[id]=1;rebalance(it);S.fresh=Object.keys(w).length?i:null;render()},
  assign:b=>{S.sheet=+b.dataset.i;renderSheet()},
  who:b=>{const i=S.sheet,it=S.draft.items[i],w=it.split.w,id=b.dataset.id;id in w?delete w[id]:w[id]=1;rebalance(it);S.fresh=Object.keys(w).length?i:null;render();renderSheet()},
  mode:b=>{const it=S.draft.items[S.sheet];it.split.mode=b.dataset.k;rebalance(it);renderSheet()},
  closesheet:()=>{S.sheet=null;renderSheet();render()},
  savebill:()=>{const d=S.draft,items=d.items.filter(i=>i.name||+i.price).map(i=>({name:i.name||'Item',qty:+i.qty||1,price:+i.price||0,split:{mode:i.split.mode,w:i.split.w}}));
    if(!items.length)return toast('Add at least one item');
    const rec={id:d.id,title:d.title||'Bill',tag:d.tag,payer:d.payer,payers:null,items,tax:+d.tax||0,service:+d.service||0,discount:+d.discount||0,ts:d.ts||Date.now()};
    const t=receiptTotals(rec);
    if(d.multi){rec.payers=Object.fromEntries(Object.entries(d.payers).map(([k,v])=>[k,+v||0]).filter(([,v])=>v>0));
      const paid=Object.values(rec.payers).reduce((s,v)=>s+Math.round(v*100),0);
      if(!t.total||paid!==t.total)return toast('The payments must add up to the total.');
      rec.payer=Object.keys(rec.payers)[0]}
    const save=()=>{F.saveReceipt(S.code,rec);log(`${S.user.name} ${d.id?'edited':'added'} “${rec.title}” for ${peso(t.total)}`);rustle();toast('Bill saved');go('group')};
    const un=t.unassigned;
    un?ask('Some items have nobody',`${un} item${un>1?'s are':' is'} not assigned to anyone, so the payer covers ${un>1?'them':'it'}.`,'Save anyway',save):save()},
  delbill:()=>ask('Delete this bill?','Everyone’s balances will update.','Delete bill',()=>{const d=S.draft;F.delReceipt(S.code,d.id);log(`${S.user.name} deleted “${d.title||'Bill'}”`);go('group');toast('Bill deleted')}),
  yes:()=>{A.closemodal();const f=S.ok;S.ok=null;f?.()},
  forget:b=>{const c=b.dataset.code,g=S.groups[c];ask('Remove this group?',`“${esc(g?.name||c)}” stays for everyone else. You can rejoin with code ${c}.`,'Remove',()=>F.leaveGroup(S.account,c))},
  leave:()=>ask('Remove from your groups?',`You can rejoin any time with code ${S.code}.`,'Remove',()=>{S.unsub?.();F.leaveGroup(S.account,S.code);go('home')}),
  delgroup:()=>ask('Delete this group?','This permanently deletes every bill and payment for everyone in the group.','Delete group',()=>{S.deleting=true;S.unsub?.();
    F.deleteGroup(S.code,{receipts:S.receipts.map(r=>r.id),payments:S.payments.map(p=>p.id),history:S.history.map(h=>h.id),members:Object.keys(mem()),account:S.account});go('home');toast('Group deleted')}),
  closemodal:()=>modal.classList.remove('on'),
  settleup:b=>{const t=S.tr[b.dataset.i],w=S.group.round;S.pay=t;
    openModal(`<h3>Pay ${esc(nm(t.to))}</h3><p class=mu><small>${esc(nm(t.from))} owes</small></p><p class=amtbig>${peso(t.amt,w)}</p>
<label style="text-align:left">Amount you’re paying now<input id=payamt type=number inputmode=decimal step=any min=0 value="${(t.amt/100).toFixed(2)}"></label>
<p class=mu><small>Paying only part of it? Change the amount. The rest stays on the balance.</small></p>
<div id=qrbox class=mu>Loading payment QR…</div><button class="btn wide" data-act=paid>Record payment</button>`);
    F.getQR(S.code,t.to).then(q=>{const e=$('#qrbox');if(e)e.innerHTML=q?`<img class=qr src="${q}" alt="Payment QR for ${esc(nm(t.to))}"><p class=mu><small>Scan with GCash, Maya or your bank app, then record the payment.</small></p>`:`<p class=mu>${esc(nm(t.to))} hasn’t added a payment QR yet.</p>`})
      .catch(()=>{const e=$('#qrbox');if(e)e.textContent='Couldn’t load the QR. Check your connection.'})},
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
  /* Phase 4: the shareable summary picture */
  summary:async()=>{toast('Making your summary…');
    try{await needCanvas()}catch{return toast('Couldn’t load the image tool. Check your connection.')}
    const g=S.group,w=g.round,L=ledger(S.receipts,S.payments),total=S.receipts.reduce((s,r)=>s+receiptTotals(r).total,0);
    const busy=new Set(S.tr.flatMap(t=>[t.from,t.to]));
    const cleared=Object.entries(L).filter(([id,m])=>(m.cost||m.paid)&&!busy.has(id)).map(([id])=>nm(id));
    const hid=Object.keys(mem()).find(id=>mem()[id].host),qr=hid?await F.getQR(S.code,hid).catch(()=>null):null;
    const cats=spendByTag(S.receipts).slice(0,5),top=cats[0]?.amt||1,col=accent(g.theme,false);
    const el=document.createElement('div');el.className='pubwrap';
    el.innerHTML=`<div class=pub><div class=pub-head style="background:${col}"><small>SPLITABLE</small><h2>${esc(g.name)}</h2><p>${new Date().toLocaleDateString('en-PH',{dateStyle:'long'})}</p></div>
<div class=pub-total><small>Total spent</small><b>${peso(total)}</b></div>
<div class=pub-body>${cats.length?`<h3>WHERE IT WENT</h3>${cats.map(c=>`<div class=pub-bar><span><span>${esc(c.tag)}</span><b>${peso(c.amt)}</b></span><div class=pub-track><div class=pub-fill style="width:${Math.max(4,Math.round(c.amt/top*100))}%;background:${col}"></div></div></div>`).join('')}`:''}
<h3>CLEARED</h3>${cleared.length?cleared.map(n=>`<span class=pill style="color:${col};border-color:${col}">${esc(n)}</span>`).join(''):'<p>Nobody yet.</p>'}
<h3>PENDING</h3>${S.tr.length?S.tr.map(t=>`<div class=pend><span>${esc(nm(t.from))} pays ${esc(nm(t.to))}</span><b>${peso(t.amt,w)}</b></div>`).join(''):'<p>All settled. Thank you!</p>'}</div>
<hr class=tear><div class=pub-qr>${qr?`<img src="${qr}" alt="" style="border-color:${col}"><p>Scan to pay ${esc(nm(hid))}</p>`:`<p>Ask ${esc(hid?nm(hid):'the host')} for their payment QR.</p>`}</div>
<div class=pub-foot>* * * THANK YOU * * *</div></div>`;
    document.body.append(el);await document.fonts.ready;
    await Promise.all([...el.querySelectorAll('img')].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r})));
    const cv=await html2canvas(el.firstElementChild,{scale:3,backgroundColor:null});el.remove();
    cv.toBlob(bl=>{S.pub=new File([bl],`${(g.name||'summary').replace(/[^\w]+/g,'-')}-summary.png`,{type:'image/png'});S.pubURL=URL.createObjectURL(bl);
      openModal(`<h3>Your summary</h3><img class=pubprev src="${S.pubURL}" alt="Summary image preview"><div class=row2><button class=btn data-act=pubsave>Save image</button>${navigator.canShare?.({files:[S.pub]})?'<button class="btn ghost" data-act=pubshare>Share…</button>':''}</div>`)})},
  pubsave:()=>{const a=document.createElement('a');a.href=S.pubURL;a.download=S.pub.name;a.click()},
  pubshare:()=>navigator.share({files:[S.pub],title:S.group.name}).catch(()=>{})
};

/* events */
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;click();A[b.dataset.act]?.(b)});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f)),k=f.dataset.form;click();
  const offline=()=>toast('Couldn’t reach the server. Check your connection.');
  if(k==='login'){const c=normalizeCode(d.code);if(!isAccountCode(c))return toast('Codes are 6 letters and numbers.');
    try{if(!await F.getUser(c))return toast('No account with that code.');LS('account',c);startSession(c)}catch{offline()}}
  if(k==='signup'){const name=d.name.trim(),c=S.start.code;if(!name)return;
    try{if(!await F.createUser(c,name)){S.start.code=generateAccountCode();S.start.name=name;render();return toast('That code was taken. Here’s a new one to save.')}
      LS('account',c);startSession(c);toast('Account created')}catch{offline()}}
  if(k==='create')openGroup(F.createGroup({name:d.name.trim(),type:d.type,account:S.account,userName:S.user.name,qrData:S.user.qrData}));
  if(k==='join')doJoin(d.code.trim());
  if(k==='guest'){const n=d.name.trim();F.addGuest(S.code,n);log(`${S.user.name} added guest ${n}`);f.reset();toast('Guest added')}});
document.addEventListener('input',e=>{const t=e.target,d=S.draft;if(t.classList.contains('codein'))t.value=normalizeCode(t.value);if(S.route!=='edit'||!d)return;
  if(t.dataset.f){d[t.dataset.f]=t.value;updTotals()}
  else if(t.dataset.k){d.items[t.dataset.i][t.dataset.k]=t.value;updTotals()}
  else if(t.dataset.pay!=null){d.payers[t.dataset.pay]=t.value;updTotals()}
  else if(t.dataset.w!=null&&S.sheet!=null){d.items[S.sheet].split.w[t.dataset.w]=t.value;chk();updTotals()}});
document.addEventListener('change',e=>{const t=e.target,f=t.files?.[0];
  if(t.id==='gcolor')setColor(t.value);
  if(t.id==='qr'&&f){toast('Saving QR…');
    shrink(f).then(img=>{F.saveQR(S.account,img,S.user.joinedGroups);S.user.qrData=img;render();toast('QR saved')}).catch(()=>toast('Couldn’t read that image.'))}});

/* start */
Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k)); // clear leftovers from the old version
applyTheme();net();addEventListener('online',net);addEventListener('offline',net);
const j=location.hash.match(/join\/(\d{6})/),dl=location.hash.match(/#\/g\/(\d{6})/);
if(j){S.joinCode=j[1];S.hm='join'}if(dl)S.deep=dl[1];
const saved=LS('account');
if(saved&&isAccountCode(saved))startSession(saved);else render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
