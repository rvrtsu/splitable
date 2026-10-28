import*as F from'./firebase.js';
import{receiptTotals,balances,settle,peso,nudgeText,inviteLink}from'./logic.js';

const $=s=>document.querySelector(s),app=$('#app'),sheet=$('#sheet'),modal=$('#modal');
const LS=(k,v)=>v===undefined?JSON.parse(localStorage.getItem('rc.'+k)||'null'):localStorage.setItem('rc.'+k,JSON.stringify(v));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>'&#'+m.charCodeAt(0)+';');
const S={route:'home',hm:'new',tab:'bills',code:null,me:null,group:null,receipts:[],payments:[],tr:[],draft:null,sheet:null,myQR:null};
const mem=()=>S.group?.members||{},nm=id=>mem()[id]?.name||'Someone',onoff=v=>v?'On':'Off';
const blank=()=>({name:'',qty:1,price:'',split:{mode:'equal',w:{}}});

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
const theme=()=>{const t=LS('theme')||'';document.documentElement.dataset.theme=t;document.querySelector('meta[name=theme-color]').content=t?'#242220':'#F9F6F0'};
const net=()=>document.body.classList.toggle('off',!navigator.onLine);
const remember=(code,name,me)=>LS('groups',[{code,name,me},...(LS('groups')||[]).filter(x=>x.code!==code)]);
const openModal=h=>{modal.innerHTML=`<div class=scrim data-act=closemodal></div><div class=card>${h}</div>`;modal.offsetHeight;modal.classList.add('on')};
async function shrink(file,max=640){ // payment QR becomes a small picture saved in Firestore
  const b=await createImageBitmap(file),s=Math.min(1,max/Math.max(b.width,b.height)),cv=document.createElement('canvas');
  cv.width=Math.round(b.width*s);cv.height=Math.round(b.height*s);const x=cv.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(b,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',.85)}

/* views */
const vSettings=()=>`<div class=paper><h3>App settings</h3>
<div class=row><span>Dark mode</span><button class="btn ghost sm" data-act=theme>${onoff(LS('theme')==='dark')}</button></div>
<div class=row style="margin-top:10px"><span>Sounds</span><button class="btn ghost sm" data-act=mute>${onoff(!LS('mute'))}</button></div></div>`;

const vHome=()=>{const gs=LS('groups')||[],n=S.hm==='new';
  return`<h1>Receipt</h1><p class=mu>Split any bill fairly. No sign-up needed.</p>
${gs.length?`<h3 class=sec>Your groups</h3>${gs.map(g=>`<button class="paper row full" data-act=open data-code=${g.code}><b>${esc(g.name)}</b><span class=mu>Code ${g.code}</span></button>`).join('')}`:''}
<div class=paper><div class=seg><button class="${n?'on':''}" data-act=hm data-k=new>New group</button><button class="${n?'':'on'}" data-act=hm data-k=join>Join a group</button></div>
${n?`<form data-form=create>
<label>Group name<input name=name placeholder="Friday dinner" required></label>
<label>Your name<input name=me placeholder="Maria" required></label>
<label>Group type<select name=type><option value=once>One-time: a single outing</option><option value=ongoing>Ongoing: roommates or regular friends</option></select></label>
<button class="btn wide">Create group</button></form>`
:`<form data-form=join>
<label>6-digit code<input name=code inputmode=numeric maxlength=6 pattern="\\d{6}" value="${S.joinCode||''}" placeholder="123456" required></label>
<label>Your name<input name=me placeholder="Maria" required></label>
<button class="btn wide">Join group</button></form>`}</div>${vSettings()}`};

const vBills=closed=>`${closed?'<div class=stamp>All paid</div>':'<button class="btn wide" data-act=newbill>+ Add a bill</button>'}
${S.receipts.length?`<h3 class=sec>Bills</h3>${S.receipts.map(r=>`<button class="paper bill full" data-act=editbill data-id=${r.id}><b>${esc(r.title)}</b><b>${peso(receiptTotals(r).total)}</b><small class=mu>Paid by ${esc(nm(r.payer))}, ${r.items.length} item${r.items.length===1?'':'s'}</small></button>`).join('')}`
:`<div class=paper><h3>How it works</h3><ol class=steps><li>Add a bill and type in the items.</li><li>Tap the names of who shared each item.</li><li>Open Settle to see who pays whom.</li></ol></div>`}`;

const vSettle=tr=>{const w=S.group.round,has=S.receipts.length;
  const head=!has?'Add a bill first, then come back here.':tr.length?`${tr.length} payment${tr.length>1?'s':''} settle${tr.length>1?'':'s'} everything`:'Everyone is settled up';
  return`<h3 class=sec>${head}</h3>
${tr.map((t,i)=>`<div class=paper><div class=tx><span><b>${esc(nm(t.from))}</b> pays <b>${esc(nm(t.to))}</b></span><b class=amt>${peso(t.amt,w)}</b></div>
<div class=row2><button class=btn data-act=settleup data-i=${i}>Pay</button><button class="btn ghost" data-act=nudge data-i=${i}>Send a reminder</button></div></div>`).join('')}
${has?`<div class=paper><div class=row><span>Round to whole pesos<br><small class=mu>Skips the centavos</small></span><button class="btn ghost sm" data-act=round>${onoff(w)}</button></div></div>
<h3 class=sec>Extras</h3><div class=row2><button class="btn ghost" data-act=share>Save summary image</button><button class="btn ghost" data-act=roulette>Bill roulette</button></div>`:''}`};

const vPeople=()=>`<h3 class=sec>Members</h3>
${Object.entries(mem()).map(([id,m])=>`<div class="paper row"><span>${esc(m.name)}${id===S.me?' (you)':''}</span>${m.guest?'<small class=mu>Guest</small>':m.host?'<small class=mu>Host</small>':''}</div>`).join('')}
<form class=paper data-form=guest><h3>Add a guest</h3><p class=mu><small>For a friend without the app. You keep track of what they owe.</small></p><div class=row><input name=name placeholder="Guest’s name" required><button class="btn sm">Add</button></div></form>
<div class=paper><h3>Your payment QR</h3><p class=mu><small>Friends see it when they tap Pay. Use your GCash, Maya or bank QR.</small></p>
${S.myQR?`<img class=qr src="${S.myQR}" alt="Your payment QR">`:''}
<label class="btn ghost wide" for=qr style="margin:12px 0 0">${S.myQR?'Replace QR':'Upload QR'}</label><input id=qr type=file accept="image/*" hidden></div>
${vSettings()}`;

const vGroup=()=>{const g=S.group;if(!g)return'<p class=mu>Loading group…</p>';
  const tr=settle(balances(S.receipts,S.payments),g.round);S.tr=tr;
  const closed=g.type==='once'&&S.receipts.length>0&&!tr.length;
  return`<div class=hdr><button class="btn ghost sm" data-act=home>← Groups</button><h2>${esc(g.name)}<small class=mu>Code ${S.code}</small></h2><button class="btn sm" data-act=invite>Invite</button></div>
${S.tab==='bills'?vBills(closed):S.tab==='settle'?vSettle(tr):vPeople()}
<nav class=tabs>${[['bills','Bills'],['settle','Settle'],['people','People']].map(([k,l])=>`<button class="tab ${S.tab===k?'on':''}" data-act=tab data-k=${k}>${l}</button>`).join('')}</nav>`};

const itemRow=(it,i)=>{const w=it.split.w,m=it.split.mode;
  return`<div class="item ${Object.keys(w).length?'assigned':''} ${S.fresh===i?'fresh':''}"><div class=iline>
<input class=nmi data-i=${i} data-k=name value="${esc(it.name)}" placeholder="Item name" aria-label="Item name">
<input class=qty data-i=${i} data-k=qty type=number inputmode=numeric min=1 value="${it.qty}" aria-label=Quantity>
<input class=prc data-i=${i} data-k=price type=number inputmode=decimal step=any placeholder="0" value="${it.price}" aria-label="Price each">
<button class=xb data-act=rmitem data-i=${i} aria-label="Remove item">✕</button></div>
<div class=who>${Object.entries(mem()).map(([id,mm])=>`<button class="chip ${id in w?'on':''}" data-act=tog data-i=${i} data-id=${id}>${esc(mm.name)}</button>`).join('')}
<button class=lnk data-act=assign data-i=${i}>${m==='equal'?'Custom split':m==='pct'?'Edit % split':'Edit ₱ split'}</button></div></div>`};

const vEdit=()=>{const d=S.draft;
  return`<div class=hdr><button class="btn ghost sm" data-act=back>← Back</button><h2>${d.id?'Edit bill':'New bill'}</h2></div>
<div class=paper><label>What was it for?<input data-f=title placeholder="Dinner at Mang Inasal" value="${esc(d.title)}"></label>
<label>Who paid the bill?<select data-f=payer>${Object.entries(mem()).map(([id,m])=>`<option value=${id} ${id===d.payer?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label></div>
<div class="paper ${S.unfold?'unfold':''}"><div class=row><h3>Items</h3><button class=lnk data-act=all>Everyone shares all</button></div>
<div class=cols><span class=nmi>Item</span><span class=qty>Qty</span><span class=prc>Price each</span><span class=xb></span></div>
${d.items.map(itemRow).join('')}<button class="btn ghost" data-act=additem>+ Add item</button></div>
<div class=paper><h3>Tax and fees</h3><p class=mu><small>Shared in proportion to what each person ordered.</small></p>
${[['tax','Tax'],['service','Service charge'],['discount','Discount']].map(([k,l])=>`<div class=row style="margin-top:8px"><span>${l}</span><input data-f=${k} type=number inputmode=decimal step=any placeholder="0" value="${d[k]||''}" style="width:110px;text-align:right" aria-label="${l}"></div>`).join('')}</div>
${d.id?'<button class="btn ghost wide" data-act=delbill>Delete this bill</button>':''}
<div class=bar><div><small class=mu id=warn>&nbsp;</small><b id=tot></b></div><button class=btn data-act=savebill>Save bill</button></div>`};

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
function render(){app.innerHTML=S.route==='home'?vHome():S.route==='edit'?vEdit():vGroup();
  if(S.route==='edit')updTotals();S.fresh=null;S.unfold=false}
const go=r=>{S.route=r;render();scrollTo(0,0)};

function updTotals(){const t=receiptTotals(S.draft);$('#tot').textContent=peso(t.total);
  $('#warn').textContent=t.unassigned?`${t.unassigned} item${t.unassigned>1?'s':''} need people`:'Total'}

function newDraft(o={}){S.draft={title:'',payer:S.me,items:[],tax:'',service:'',discount:'',...o};if(!S.draft.items.length)S.draft.items.push(blank())}
const rebalance=it=>{const sp=it.split,ids=Object.keys(sp.w),n=ids.length||1,t=it.qty*it.price;
  ids.forEach(id=>sp.w[id]=sp.mode==='equal'?1:+(sp.mode==='pct'?100/n:t/n).toFixed(2))};

function openGroup(code){S.unsub?.();Object.assign(S,{code,group:null,receipts:[],payments:[],tab:'bills',myQR:null,me:(LS('groups')||[]).find(g=>g.code===code)?.me});
  const r=()=>{if(S.route==='group'&&!document.activeElement?.matches('input,select'))render()};
  S.unsub=F.watch(code,{onGroup:g=>{S.group=g;r()},onReceipts:x=>{S.receipts=x;r()},onPayments:x=>{S.payments=x;r()}});
  F.getQR(code,S.me).then(q=>{S.myQR=q;r()}).catch(()=>{});go('group')}

/* actions */
const A={
  home:()=>{S.unsub?.();go('home')},open:b=>openGroup(b.dataset.code),hm:b=>{S.hm=b.dataset.k;render()},
  tab:b=>{S.tab=b.dataset.k;render()},
  theme:()=>{LS('theme',LS('theme')==='dark'?'':'dark');theme();render()},mute:()=>{LS('mute',!LS('mute'));render()},
  invite:async()=>{await copy(inviteLink(S.code));toast(`Invite link copied. Code: ${S.code}`)},
  round:()=>F.setRound(S.code,!S.group.round),
  newbill:()=>{newDraft();S.unfold=true;go('edit')},
  editbill:b=>{newDraft(structuredClone(S.receipts.find(r=>r.id===b.dataset.id)));go('edit')},
  back:()=>{S.sheet=null;renderSheet();go('group')},
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
    const un=receiptTotals({items}).unassigned;
    if(un&&!confirm(`${un} item${un>1?'s have':' has'} nobody assigned, so no one will be charged for ${un>1?'them':'it'}. Save anyway?`))return;
    F.saveReceipt(S.code,{id:d.id,title:d.title||'Bill',payer:d.payer,items,tax:+d.tax||0,service:+d.service||0,discount:+d.discount||0,ts:d.ts||Date.now()});
    rustle();toast('Bill saved');go('group')},
  delbill:()=>{if(confirm('Delete this bill?')){F.delReceipt(S.code,S.draft.id);go('group')}},
  closemodal:()=>modal.classList.remove('on'),
  settleup:b=>{const t=S.tr[b.dataset.i];
    openModal(`<h3>Pay ${esc(nm(t.to))}</h3><p class=amtbig>${peso(t.amt,S.group.round)}</p><div id=qrbox class=mu>Loading payment QR…</div><p class=mu><small>Send the money first, then tap the button.</small></p><button class="btn wide" data-act=paid data-i=${b.dataset.i}>I’ve paid</button>`);
    F.getQR(S.code,t.to).then(q=>{const e=$('#qrbox');if(e)e.innerHTML=q?`<img class=qr src="${q}" alt="Payment QR for ${esc(nm(t.to))}"><p class=mu><small>Scan with GCash, Maya or your bank app.</small></p>`:`<p class=mu>${esc(nm(t.to))} hasn’t added a payment QR yet.</p>`})
      .catch(()=>{const e=$('#qrbox');if(e)e.textContent='Couldn’t load the QR. Check your connection.'})},
  paid:b=>{const t=S.tr[b.dataset.i];F.recordPayment(S.code,{from:t.from,to:t.to,amt:t.amt});ding();A.closemodal();toast('Marked as paid')},
  nudge:b=>{const t=S.tr[b.dataset.i];S.nd=t;
    openModal(`<h3>Remind ${esc(nm(t.from))}</h3><div class=seg>${['funny','gentle','dramatic'].map((k,i)=>`<button class="${i?'':'on'}" data-act=tone data-k=${k}>${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div><textarea id=nt rows=5>${esc(nudgeText(nm(t.from),peso(t.amt,S.group.round),'funny',S.group.name))}</textarea><button class="btn wide" data-act=copynudge>Copy message</button>`)},
  tone:b=>{const t=S.nd;$('#nt').value=nudgeText(nm(t.from),peso(t.amt,S.group.round),b.dataset.k,S.group.name);modal.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b))},
  copynudge:async()=>{await copy($('#nt').value);toast('Copied')},
  roulette:()=>{const ids=Object.keys(mem()),n=ids.length,seg=360/n;
    const bg=ids.map((_,i)=>`hsl(${i*360/n} 30% ${i%2?84:74}%) ${i*seg}deg ${(i+1)*seg}deg`).join(',');
    openModal(`<h3>Bill roulette</h3><p class=mu><small>Spin to pick who pays for a shared item, tip or delivery fee.</small></p><div class=wheelwrap><i class=pin></i><div class=wheel id=wheel style="background:conic-gradient(${bg})">${ids.map((id,i)=>`<span style="transform:rotate(${(i+.5)*seg}deg) translate(-50%,-92px)">${esc(nm(id))}</span>`).join('')}</div></div><p class=amtbig id=win>&nbsp;</p><button class="btn wide" data-act=spin>Spin</button>`)},
  spin:b=>{const ids=Object.keys(mem()),n=ids.length,seg=360/n,w=Math.floor(Math.random()*n),el=$('#wheel'),cur=el._r||0;
    const to=cur-(cur%360)+360*5+(360-(w*seg+seg/2));el._r=to;el.style.transform=`rotate(${to}deg)`;b.disabled=true;$('#win').textContent='…';
    for(let i=0;i<14;i++)setTimeout(click,i*i*20);
    setTimeout(()=>{$('#win').textContent=nm(ids[w])+' pays!';ding();b.disabled=false;b.textContent='Spin again'},4100)},
  share:async()=>{toast('Making your image…');
    if(!window.html2canvas)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=ok;s.onerror=no;document.head.append(s)}).catch(()=>0);
    if(!window.html2canvas)return toast('Couldn’t load the image tool. Check your connection.');
    const w=S.group.round,el=document.createElement('div');el.className='rcpt';
    el.innerHTML=`<h2>${esc(S.group.name)}</h2><p>${new Date().toLocaleDateString('en-PH',{dateStyle:'medium'})}</p><hr>
${S.tr.map(t=>`<div class=row><span>${esc(nm(t.from))} pays ${esc(nm(t.to))}</span><b>${peso(t.amt,w)}</b></div>`).join('')||'<p>All settled.</p>'}<hr><p>${S.tr.length} payment${S.tr.length===1?'':'s'} to go</p><p>* * * thank you * * *</p>`;
    document.body.append(el);await document.fonts.ready;
    const cv=await html2canvas(el,{scale:2,backgroundColor:'#F9F6F0'});el.remove();
    cv.toBlob(async bl=>{const f=new File([bl],'receipt-summary.png',{type:'image/png'});
      if(navigator.canShare?.({files:[f]}))try{await navigator.share({files:[f]});return}catch{}
      const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download=f.name;a.click()})}
};

/* events */
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;click();A[b.dataset.act]?.(b)});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f)),k=f.dataset.form;click();
  if(k==='create'){const{code,me}=F.createGroup({name:d.name.trim(),type:d.type,me:d.me.trim()});remember(code,d.name.trim(),me);openGroup(code)}
  if(k==='join'){if(!navigator.onLine)return toast('Joining needs internet.');
    try{const c=d.code.trim(),r=await F.joinGroup(c,d.me.trim());remember(c,r.name,r.me);history.replaceState(null,'',location.pathname);S.joinCode='';openGroup(c)}
    catch{toast('No group found with that code.')}}
  if(k==='guest'){F.addGuest(S.code,d.name.trim());f.reset();toast('Guest added')}});
document.addEventListener('input',e=>{const t=e.target,d=S.draft;if(S.route!=='edit'||!d)return;
  if(t.dataset.f){d[t.dataset.f]=t.value;updTotals()}
  else if(t.dataset.k){d.items[t.dataset.i][t.dataset.k]=t.value;updTotals()}
  else if(t.dataset.w!=null&&S.sheet!=null){d.items[S.sheet].split.w[t.dataset.w]=t.value;chk();updTotals()}});
document.addEventListener('change',e=>{const t=e.target,f=t.files?.[0];
  if(t.id==='qr'&&f){toast('Saving QR…');
    shrink(f).then(img=>{F.saveQR(S.code,S.me,img);S.myQR=img;render();toast('QR saved')}).catch(()=>toast('Couldn’t read that image.'))}});

/* start */
theme();net();addEventListener('online',net);addEventListener('offline',net);
const j=location.hash.match(/join\/(\d{6})/);if(j){S.joinCode=j[1];S.hm='join'}
render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
