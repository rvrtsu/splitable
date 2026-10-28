import*as F from'./firebase.js';
import{receiptTotals,balances,settle,peso,nudgeText,inviteLink}from'./logic.js';
import{scanReceipt}from'./ai.js';

const $=s=>document.querySelector(s),app=$('#app'),sheet=$('#sheet'),modal=$('#modal');
const LS=(k,v)=>v===undefined?JSON.parse(localStorage.getItem('rc.'+k)||'null'):localStorage.setItem('rc.'+k,JSON.stringify(v));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>'&#'+m.charCodeAt(0)+';');
const S={route:'home',tab:'bills',code:null,me:null,group:null,receipts:[],payments:[],tr:[],draft:null,sheet:null};
const mem=()=>S.group?.members||{},nm=id=>mem()[id]?.name||'?';
const blank=()=>({name:'',qty:1,price:0,split:{mode:'equal',w:{}}});

/* sounds: synthesized, so no audio files to load */
let ac;const ctx=()=>ac??=new AudioContext();
const tone=(f,d,t='sine',v=.06,at=0)=>{if(LS('mute'))return;const x=ctx(),o=x.createOscillator(),g=x.createGain(),s=x.currentTime+at;
  o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,s);g.gain.exponentialRampToValueAtTime(.0001,s+d);o.connect(g).connect(x.destination);o.start(s);o.stop(s+d)};
const click=()=>tone(1400,.03,'square',.02),ding=()=>{tone(1568,.5,'sine',.08);tone(2093,.7,'sine',.05,.08)};
const rustle=()=>{if(LS('mute'))return;const x=ctx(),n=x.sampleRate*.35,b=x.createBuffer(1,n,x.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n)**2;const s=x.createBufferSource(),f=x.createBiquadFilter(),g=x.createGain();
  f.type='highpass';f.frequency.value=2500;g.gain.value=.15;s.buffer=b;s.connect(f).connect(g).connect(x.destination);s.start()};

/* helpers */
let tt;const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2800)};
const copy=async s=>{try{await navigator.clipboard.writeText(s)}catch{const a=document.createElement('textarea');a.value=s;document.body.append(a);a.select();document.execCommand('copy');a.remove()}toast('Copied')};
const theme=()=>{const t=LS('theme')||'';document.documentElement.dataset.theme=t;document.querySelector('meta[name=theme-color]').content=t?'#242220':'#F9F6F0'};
const net=()=>document.body.classList.toggle('off',!navigator.onLine);
const remember=(code,name,me)=>{const g=(LS('groups')||[]).filter(x=>x.code!==code);LS('groups',[{code,name,me},...g])};
const openModal=h=>{modal.innerHTML=`<div class=scrim data-act=closemodal></div><div class=card>${h}</div>`;modal.offsetHeight;modal.classList.add('on')};

/* views */
const vHome=()=>{const gs=LS('groups')||[];return`<h1>Receipt</h1><p class=mu>Split the bill, not the friendship.</p>
${gs.map(g=>`<button class="paper row full" data-act=open data-code=${g.code}><b>${esc(g.name)}</b><span class=mu>${g.code}</span></button>`).join('')}
<form class=paper data-form=create><h3>Start a group</h3>
<input name=name placeholder="Group name, like Friday dinner" required><input name=me placeholder="Your name" required>
<select name=type aria-label="Group type"><option value=once>One-time: closes when everyone has paid</option><option value=ongoing>Ongoing: debts carry forward</option></select>
<button class=btn>Create group</button></form>
<form class=paper data-form=join><h3>Join with a code</h3>
<input name=code inputmode=numeric maxlength=6 pattern="\\d{6}" placeholder="6-digit code" value="${S.joinCode||''}" required>
<input name=me placeholder="Your name" required><button class=btn>Join group</button></form>`};

const vBills=closed=>`${closed?'':`<div class=row><label class=btn for=scan>Scan receipt</label><input id=scan type=file accept="image/*" capture=environment hidden><button class="btn ghost" data-act=newbill>Add by hand</button></div>`}
${S.receipts.map(r=>`<button class="paper row full" data-act=editbill data-id=${r.id}><span>${esc(r.title)}<br><small class=mu>paid by ${esc(nm(r.payer))}</small></span><b>${peso(receiptTotals(r).total)}</b></button>`).join('')||'<p class=mu>No bills yet. Scan a receipt to begin.</p>'}`;

const vSettle=tr=>{const w=S.group.round;return`<div class=paper><div class=row><span>Round to whole pesos</span><button class="btn ghost" data-act=round>${w?'On':'Off'}</button></div></div>
${tr.map((t,i)=>`<div class=paper><div class=row><span><b>${esc(nm(t.from))}</b> pays <b>${esc(nm(t.to))}</b></span><b>${peso(t.amt,w)}</b></div>
<div class=row style="margin-top:10px"><button class=btn data-act=settleup data-i=${i}>Settle up</button><button class="btn ghost" data-act=nudge data-i=${i}>Polite nudge</button></div></div>`).join('')||'<p class=mu>Nobody owes anything.</p>'}
<div class=row><button class="btn ghost" data-act=share>Share summary</button><button class="btn ghost" data-act=roulette>Bill roulette</button></div>`};

const vPeople=()=>`${Object.entries(mem()).map(([id,m])=>`<div class="paper row"><span>${esc(m.name)}${m.guest?' (guest)':''}${id===S.me?' (you)':''}</span>${m.qr?'<small class=mu>QR saved</small>':''}</div>`).join('')}
<form class=paper data-form=guest><h3>Add a guest</h3><p class=mu>For friends without the app. You track their share for them.</p><input name=name placeholder="John" required><button class=btn>Add guest</button></form>
<div class=paper><h3>Your payment QR</h3><p class=mu>Upload your GCash, Maya or bank QR so friends can pay you.</p><label class="btn ghost" for=qr>Upload QR</label><input id=qr type=file accept="image/*" hidden></div>
<div class=paper><h3>Gemini API key</h3><p class=mu>Used for receipt scanning. Stays on this device.</p><input id=key type=password autocomplete=off placeholder="Paste your key" value="${esc(LS('key')||'')}"></div>`;

const vGroup=()=>{const g=S.group;if(!g)return'<p class=mu>Loading group…</p>';
  const tr=settle(balances(S.receipts,S.payments),g.round);S.tr=tr;
  const closed=g.type==='once'&&S.receipts.length>0&&!tr.length;
  return`<div class=row><button class="btn ghost" data-act=home aria-label="Back to groups">←</button><div style="flex:1;min-width:0"><h2>${esc(g.name)}</h2><small class=mu>${g.type==='once'?'One-time group':'Ongoing group'}, code ${S.code}</small></div><button class="btn ghost" data-act=theme aria-label="Toggle dark mode">◐</button></div>
<div class=row style="margin-top:10px"><button class="btn ghost" data-act=copylink>Copy invite link</button><button class="btn ghost" data-act=mute>${LS('mute')?'Sound off':'Sound on'}</button></div>
${closed?'<div class=stamp>All paid</div>':''}
${S.tab==='bills'?vBills(closed):S.tab==='settle'?vSettle(tr):vPeople()}
<nav class=tabs>${[['bills','Bills'],['settle','Settle'],['people','People']].map(([k,l])=>`<button class="tab ${S.tab===k?'on':''}" data-act=tab data-k=${k}>${l}</button>`).join('')}</nav>`};

const itemRow=(it,i)=>{const ids=Object.keys(it.split?.w||{});
  return`<div class="item ${ids.length?'assigned':''} ${S.fresh===i?'fresh':''}"><div class=row>
<input data-i=${i} data-k=name value="${esc(it.name)}" placeholder="Item" aria-label="Item name">
<input data-i=${i} data-k=qty type=number inputmode=numeric value="${it.qty}" style="width:48px;text-align:center" aria-label=Quantity>
<input data-i=${i} data-k=price type=number inputmode=decimal step=any value="${it.price}" style="width:90px;text-align:right" aria-label="Unit price"></div>
<button class=assign data-act=assign data-i=${i}>${ids.length?ids.map(id=>`<span class=chip>${esc(nm(id))}</span>`).join(''):'Tap to assign'}</button></div>`};

const vEdit=()=>{const d=S.draft,L={tax:'Tax',service:'Service charge',discount:'Discount'};
  return`<div class=row><button class="btn ghost" data-act=back aria-label=Back>←</button><h2>${d.id?'Edit bill':'New bill'}</h2><span></span></div>
<div class="paper ${S.unfold?'unfold':''}"><input data-f=title placeholder="Where did you eat?" value="${esc(d.title)}">
<small class=mu>Paid by</small><select data-f=payer>${Object.entries(mem()).map(([id,m])=>`<option value=${id} ${id===d.payer?'selected':''}>${esc(m.name)}</option>`).join('')}</select>
<div class=dots></div>${d.items.map(itemRow).join('')}<button class="btn ghost" style="margin-top:10px" data-act=additem>Add item</button><div class=dots></div>
${Object.keys(L).map(k=>`<div class=row style="margin-bottom:6px"><label>${L[k]}</label><input data-f=${k} type=number inputmode=decimal step=any value="${d[k]||''}" style="width:110px;text-align:right"></div>`).join('')}
<div class=dots></div><div class=row><b>Total</b><b id=tot></b></div><small id=warn class=mu></small></div>
<button class=btn style="width:100%" data-act=savebill>Save bill</button>${d.id?'<button class="btn ghost" style="width:100%;margin-top:8px" data-act=delbill>Delete bill</button>':''}`};

const vSheet=()=>{const it=S.draft.items[S.sheet],sp=it.split;
  return`<div class=scrim data-act=closesheet></div><div class=panel><h3>${esc(it.name||'Item')}</h3>
<div class=seg>${[['equal','Equal parts'],['pct','Percent'],['exact','Exact ₱']].map(([k,l])=>`<button class="${sp.mode===k?'on':''}" data-act=mode data-k=${k}>${l}</button>`).join('')}</div>
${Object.entries(mem()).map(([id,m])=>{const on=id in sp.w;return`<div class=row><button class="chip ${on?'on':''}" data-act=who data-id=${id}>${esc(m.name)}</button>${on&&sp.mode!=='equal'?`<input data-w=${id} type=number inputmode=decimal step=any value="${sp.w[id]??''}" style="width:90px;text-align:right" aria-label="${esc(m.name)} share">`:''}</div>`}).join('')}
<button class=btn style="width:100%;margin-top:12px" data-act=closesheet>Done</button></div>`};

function renderSheet(){if(S.sheet==null){sheet.classList.remove('on');return}
  const first=!sheet.classList.contains('on');sheet.innerHTML=vSheet();if(first){sheet.offsetHeight;sheet.classList.add('on')}}
function render(){app.innerHTML=S.route==='home'?vHome():S.route==='edit'?vEdit():vGroup();
  if(S.route==='edit')updTotals();S.fresh=null;S.unfold=false}
const go=r=>{S.route=r;render();scrollTo(0,0)};

function updTotals(){const t=receiptTotals(S.draft);$('#tot').textContent=peso(t.total);
  const s=S.draft._sub,m=[];
  if(s&&Math.abs(t.sub-Math.round(s*100))>Math.max(100,s))m.push(`Items add up to ${peso(t.sub)} but the receipt says ${peso(Math.round(s*100))}. Check the prices.`);
  if(t.unassigned)m.push(`${t.unassigned} item${t.unassigned>1?'s':''} not assigned yet.`);
  $('#warn').textContent=m.join(' ')}

function newDraft(o={}){S.draft={title:'',payer:S.me,items:[],tax:0,service:0,discount:0,...o};if(!S.draft.items.length)S.draft.items.push(blank())}
const rebalance=it=>{const sp=it.split,ids=Object.keys(sp.w),n=ids.length||1,t=it.qty*it.price;
  ids.forEach(id=>sp.w[id]=sp.mode==='equal'?1:+(sp.mode==='pct'?100/n:t/n).toFixed(2))};

function openGroup(code){S.unsub?.();Object.assign(S,{code,group:null,receipts:[],payments:[],tab:'bills',me:(LS('groups')||[]).find(g=>g.code===code)?.me});
  const r=()=>{if(S.route==='group'&&!document.activeElement?.matches('input,select'))render()};
  S.unsub=F.watch(code,{onGroup:g=>{S.group=g;r()},onReceipts:x=>{S.receipts=x;r()},onPayments:x=>{S.payments=x;r()}});go('group')}

/* actions */
const A={
  home:()=>{S.unsub?.();go('home')},open:b=>openGroup(b.dataset.code),
  tab:b=>{S.tab=b.dataset.k;render()},theme:()=>{LS('theme',LS('theme')==='dark'?'':'dark');theme()},
  mute:()=>{LS('mute',!LS('mute'));render()},copylink:()=>copy(inviteLink(S.code)),
  round:()=>F.setRound(S.code,!S.group.round),
  newbill:()=>{newDraft();go('edit')},
  editbill:b=>{newDraft(structuredClone(S.receipts.find(r=>r.id===b.dataset.id)));go('edit')},
  back:()=>{S.sheet=null;renderSheet();go('group')},
  additem:()=>{S.draft.items.push(blank());render()},
  assign:b=>{S.sheet=+b.dataset.i;renderSheet()},
  who:b=>{const i=S.sheet,it=S.draft.items[i],w=it.split.w,id=b.dataset.id;id in w?delete w[id]:w[id]=1;rebalance(it);S.fresh=Object.keys(w).length?i:null;render();renderSheet()},
  mode:b=>{const it=S.draft.items[S.sheet];it.split.mode=b.dataset.k;rebalance(it);renderSheet()},
  closesheet:()=>{S.sheet=null;renderSheet();render()},
  savebill:()=>{const d=S.draft,items=d.items.filter(i=>i.name||i.price).map(i=>({name:i.name||'Item',qty:+i.qty||1,price:+i.price||0,split:{mode:i.split.mode,w:i.split.w}}));
    if(!items.length)return toast('Add at least one item');
    F.saveReceipt(S.code,{id:d.id,title:d.title||'Bill',payer:d.payer,items,tax:+d.tax||0,service:+d.service||0,discount:+d.discount||0,ts:d.ts||Date.now()});
    rustle();toast('Bill saved');go('group')},
  delbill:()=>{if(confirm('Delete this bill?')){F.delReceipt(S.code,S.draft.id);go('group')}},
  closemodal:()=>modal.classList.remove('on'),
  settleup:b=>{const t=S.tr[b.dataset.i],q=mem()[t.to]?.qr;
    openModal(`<h3>Pay ${esc(nm(t.to))}</h3><p class=big>${peso(t.amt,S.group.round)}</p>${q?`<img class=qr src="${esc(q)}" alt="Payment QR">`:'<p class=mu>No QR saved yet. Ask them to upload one in People.</p>'}<br><button class=btn data-act=paid data-i=${b.dataset.i}>Mark as paid</button>`)},
  paid:b=>{const t=S.tr[b.dataset.i];F.recordPayment(S.code,{from:t.from,to:t.to,amt:t.amt});ding();A.closemodal();toast('Marked as paid')},
  nudge:b=>{const t=S.tr[b.dataset.i];S.nd=t;
    openModal(`<h3>Nudge ${esc(nm(t.from))}</h3><div class=seg>${['funny','gentle','dramatic'].map((k,i)=>`<button class="${i?'':'on'}" data-act=tone data-k=${k}>${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div><textarea id=nt rows=5>${esc(nudgeText(nm(t.from),peso(t.amt,S.group.round),'funny',S.group.name))}</textarea><button class=btn data-act=copynudge>Copy message</button>`)},
  tone:b=>{const t=S.nd;$('#nt').value=nudgeText(nm(t.from),peso(t.amt,S.group.round),b.dataset.k,S.group.name);modal.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b))},
  copynudge:()=>copy($('#nt').value),
  roulette:()=>{const ids=Object.keys(mem()),n=ids.length,seg=360/n;
    const bg=ids.map((_,i)=>`hsl(${i*360/n} 30% ${i%2?84:74}%) ${i*seg}deg ${(i+1)*seg}deg`).join(',');
    openModal(`<h3>Bill roulette</h3><input id=why placeholder="Who pays for what? (optional)"><div class=wheelwrap><i class=pin></i><div class=wheel id=wheel style="background:conic-gradient(${bg})">${ids.map((id,i)=>`<span style="transform:rotate(${(i+.5)*seg}deg) translate(-50%,-92px)">${esc(nm(id))}</span>`).join('')}</div></div><p class=big id=win>&nbsp;</p><button class=btn id=spin data-act=spin>Spin</button>`)},
  spin:b=>{const ids=Object.keys(mem()),n=ids.length,seg=360/n,w=Math.floor(Math.random()*n),el=$('#wheel'),cur=el._r||0;
    const to=cur-(cur%360)+360*5+(360-(w*seg+seg/2));el._r=to;el.style.transform=`rotate(${to}deg)`;b.disabled=true;$('#win').textContent='…';
    for(let i=0;i<14;i++)setTimeout(click,i*i*20);
    setTimeout(()=>{$('#win').textContent=nm(ids[w])+' pays!';ding();b.disabled=false;b.textContent='Spin again'},4100)},
  share:async()=>{toast('Making your receipt…');
    if(!window.html2canvas)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=ok;s.onerror=no;document.head.append(s)}).catch(()=>0);
    if(!window.html2canvas)return toast('Could not load the image tool. Check your connection.');
    const w=S.group.round,el=document.createElement('div');el.className='rcpt';
    el.innerHTML=`<h2>${esc(S.group.name)}</h2><p>${new Date().toLocaleDateString('en-PH',{dateStyle:'medium'})}</p><div class=dots></div>
${S.tr.map(t=>`<div class=row><span>${esc(nm(t.from))} pays ${esc(nm(t.to))}</span><b>${peso(t.amt,w)}</b></div>`).join('')||'<p>All settled.</p>'}<div class=dots></div><p>${S.tr.length} payment${S.tr.length===1?'':'s'} to go</p><p>* * * thank you * * *</p>`;
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
    try{const r=await F.joinGroup(d.code.trim(),d.me.trim());remember(d.code.trim(),r.name,r.me);history.replaceState(null,'',location.pathname);S.joinCode='';openGroup(d.code.trim())}
    catch{toast('No group with that code.')}}
  if(k==='guest'){F.addGuest(S.code,d.name.trim());f.reset();toast('Guest added')}});
document.addEventListener('input',e=>{const t=e.target,d=S.draft;if(S.route!=='edit'||!d)return;
  const v=t.type==='number'?+t.value:t.value;
  if(t.dataset.f){d[t.dataset.f]=v;updTotals()}
  else if(t.dataset.k){d.items[t.dataset.i][t.dataset.k]=v;updTotals()}
  else if(t.dataset.w!=null&&S.sheet!=null){d.items[S.sheet].split.w[t.dataset.w]=v;updTotals()}});
document.addEventListener('change',e=>{const t=e.target,f=t.files?.[0];
  if(t.id==='key')LS('key',t.value.trim());
  if(t.id==='scan'&&f)scan(f);
  if(t.id==='qr'&&f){if(!navigator.onLine)return toast('Uploading needs internet.');toast('Uploading…');
    F.uploadQR(S.code,S.me,f).then(()=>toast('QR saved'),()=>toast('Upload failed. Try again.'))}});

async function scan(file){
  if(!navigator.onLine)return toast('Scanning needs internet. Add items by hand and they will sync later.');
  const key=LS('key');if(!key){S.tab='people';render();return toast('Add your Gemini API key first')}
  rustle();toast('Reading receipt…');
  try{const r=await scanReceipt(file,key);
    newDraft({title:r.merchant||'',_sub:r.subtotal,tax:r.tax||0,service:r.service_charge||0,discount:r.discount||0,
      items:r.items.map(i=>({name:i.name,qty:i.qty||1,price:i.price||0,split:{mode:'equal',w:{}}}))});
    S.unfold=true;go('edit')}
  catch{toast('Could not read that receipt. Retake the photo or add items by hand.')}}

/* boot */
theme();net();addEventListener('online',net);addEventListener('offline',net);
const j=location.hash.match(/join\/(\d{6})/);if(j)S.joinCode=j[1];
render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
