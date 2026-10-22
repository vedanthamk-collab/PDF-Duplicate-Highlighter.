import * as pdfjsLib from './vendor/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdf.worker.mjs');
const $=id=>document.getElementById(id);
const state={pdf:null,bytes:null,name:'document.pdf',signatures:[],matches:[],possible:[],overrides:new Map(),run:0,ocrReady:false};
const cards=new Map();
let pageObserver=null;
const sleepFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const MODE=[{name:'High accuracy'},{name:'High accuracy'},{name:'High accuracy'}];
$('threshold').value='0';
const mode=()=>MODE[Number($('threshold').value)];
$('threshold').oninput=()=>{$('thresholdLabel').textContent=mode().name;};
$('threshold').onchange=()=>{if(state.signatures.length)classify();};
$('possible').onchange=renderMarks;
$('file').onchange=async e=>{const f=e.target.files?.[0];if(f)await openPdf(await f.arrayBuffer(),f.name);e.target.value='';};
$('rescan').onclick=()=>scan();
$('jumpForm').onsubmit=e=>{e.preventDefault();const n=Number($('jump').value);if(!Number.isInteger(n)||n<1||n>cards.size){$('jumpStatus').textContent='Enter a page from 1 to '+cards.size;return;}cards.get(n).scrollIntoView({behavior:'smooth',block:'start'});$('jumpStatus').textContent='Page '+n+' of '+cards.size;};
$('export').onclick=downloadClean;

function status(message){$('progress').textContent=message;}
const params=new URLSearchParams(location.search);
if(params.has('source')){
 const url=params.get('source');status('Importing PDF link…');
 try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error('Unsupported URL');const r=await fetch(u.toString(),{credentials:'include'});if(!r.ok)throw Error('HTTP '+r.status);await openPdf(await r.arrayBuffer(),decodeURIComponent(u.pathname.split('/').pop()||'portal.pdf'));}
 catch(e){status('Portal import failed: '+e.message+'. Download that PDF from the portal and choose it here.');}
}
async function openPdf(data,name){
 ++state.run;pageObserver?.disconnect();pageObserver=null;state.pdf=null;state.signatures=[];state.matches=[];state.possible=[];state.overrides.clear();cards.clear();
 $('pages').replaceChildren();$('matches').replaceChildren();$('placeholder').hidden=true;$('export').disabled=true;$('rescan').disabled=true;
 try{state.bytes=new Uint8Array(data);state.pdf=await pdfjsLib.getDocument({data:state.bytes.slice()}).promise;state.name=name;await scan();}
 catch(err){status('Unable to load PDF: '+err.message);$('stats').textContent='Could not read PDF';console.error(err);}
}
async function renderPage(page,scale){
 const v=page.getViewport({scale});const c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
 await page.render({canvasContext:ctx,viewport:v}).promise;return c;
}
function reduced(canvas,rotation=0){
 // Same physical PDF content, 4 possible orientations. Keep sharp enough to distinguish actual printed detail.
 const c=document.createElement('canvas');const portrait=(rotation%180)===0;
 c.width=portrait?96:128;c.height=portrait?128:96;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);
 ctx.translate(c.width/2,c.height/2);ctx.rotate(rotation*Math.PI/180);
 const boundW=rotation%180===0?c.width:c.height,boundH=rotation%180===0?c.height:c.width;
 const s=Math.min(boundW/canvas.width,boundH/canvas.height);
 ctx.drawImage(canvas,-canvas.width*s/2,-canvas.height*s/2,canvas.width*s,canvas.height*s);
 const rgba=ctx.getImageData(0,0,c.width,c.height).data;
 const gray=new Uint8Array(c.width*c.height),dark=new Uint8Array(gray.length);
 let ink=0;
 for(let i=0;i<gray.length;i++){const j=i*4;gray[i]=Math.round(.299*rgba[j]+.587*rgba[j+1]+.114*rgba[j+2]);dark[i]=gray[i]<190?1:0;ink+=dark[i];}
 return {gray,dark,coverage:ink/gray.length,w:c.width,h:c.height};
}
function signature(canvas,text){
 return {rotations:[reduced(canvas,0),reduced(canvas,90),reduced(canvas,180),reduced(canvas,270)],text};
}
function textTokens(content){
 const raw=content.items.map(item=>item.str||'').join(' ').toLowerCase().replace(/\s+/g,' ').trim();
 // Do not use recurring report boilerplate alone for identity.
 const words=raw.match(/[a-z0-9]+/g)||[];
 return words.length>=15?words:null;
}
function compareImages(a,b){
 if(a.w!==b.w||a.h!==b.h)return 0;
 const n=a.gray.length;
 // Whole-page light similarity alone is unsafe for sparse reports. Compare printed foreground overlap.
 let overlap=0,union=0,changes=0,fgDiff=0,filledA=0,filledB=0;
 for(let i=0;i<n;i++){
  const x=a.dark[i],y=b.dark[i];if(x)filledA++;if(y)filledB++;
  if(x&&y)overlap++;if(x||y){union++;fgDiff+=Math.abs(a.gray[i]-b.gray[i]);}
  if(x!==y)changes++;
 }
 if(union<180||Math.min(filledA,filledB)/Math.max(filledA,filledB||1)<.7)return 0;
 const iou=overlap/union,balanced=2*overlap/(filledA+filledB);
 const agreement=1-changes/union;
 return Math.min(iou,balanced,agreement);
}
function compareText(a,b){
 if(!a||!b)return null;
 const fa=new Map(),fb=new Map();
 for(const t of a)fa.set(t,(fa.get(t)||0)+1);
 for(const t of b)fb.set(t,(fb.get(t)||0)+1);
 let intersection=0,totalA=0,totalB=0;
 for(const v of fa.values())totalA+=v;
 for(const v of fb.values())totalB+=v;
 for(const [k,v] of fa)intersection+=Math.min(v,fb.get(k)||0);
 return (2*intersection)/(totalA+totalB);
}
function similarity(a,b){
 const ta=compareText(a.text,b.text);
 let visual=0;
 // Rotate only one scan relative to the other; full 0/90/180/270° candidates.
 for(const r of b.rotations){const value=compareImages(a.rotations[0],r);if(value>visual)visual=value;}
 return {visual,semantic:ta};
}
function fingerprint(text){
 const raw=(text||'').toLowerCase().replace(/[^a-z0-9./\s-]/g,' ');
 const words=(raw.match(/[a-z]{2,}|\d+(?:[./-]\d+)*/g)||[]);
 const counts=new Map(),numbers=new Map();
 for(const word of words){counts.set(word,(counts.get(word)||0)+1);if(/\d/.test(word)&&word.length>=2)numbers.set(word,(numbers.get(word)||0)+1);}
 return {words,counts,numbers};
}
function overlap(a,b){
 let common=0,na=0,nb=0;
 for(const v of a.values())na+=v;for(const v of b.values())nb+=v;
 for(const [k,v] of a)common+=Math.min(v,b.get(k)||0);
 return na+nb?2*common/(na+nb):0;
}
function extractedIds(raw){
 const cleaned=(raw||'').toLowerCase().replace(/\s+/g,' ');
 const out={};
 for(const [kind,re] of [
  ['invoice',/(?:invoice|bill)\s*(?:no|number|#|:|\.){0,8}\s*[:.#-]?\s*([0-9-]{8,})/],
  ['patient',/(?:patient\s*id|lab\s*no)\s*[:.#-]?\s*([0-9-]{8,})/]
 ]){const match=cleaned.match(re);if(match)out[kind]=match[1].replace(/-/g,'');}
 return out;
}
function identityConflict(a,b){
 const x=extractedIds(a.ocr),y=extractedIds(b.ocr);
 for(const key of ['invoice','patient']){
  if(x[key]&&y[key]&&x[key]!==y[key])return true;
 }
 return false;
}
function clinicalValue(text){
 const raw=(text||'').toLowerCase().replace(/\s+/g,' ');
 // Explicit value attached to named investigation. Shared lab form headings aren't enough.
 const match=raw.match(/\bcrp\b\s*[:=-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mg|\/|mgl|$)/)
  ||raw.match(/\bcrp\b\s*[:=-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)(?=\s)/);
 return match?['crp',match[1].replace(',','.')]:null;
}
function classify(){
 state.matches=[];state.possible=[];const originals=[];
 for(let i=0;i<state.signatures.length;i++){
  const current=state.signatures[i],currentText=fingerprint(current.ocr||'');
  const currentIds=extractedIds(current.ocr||'');let best=null;
  for(const j of originals){
   const ref=state.signatures[j],ids=extractedIds(ref.ocr||'');
   if(identityConflict(current,ref))continue;
   const source=fingerprint(ref.ocr||'');
   if(currentText.words.length<24||source.words.length<24)continue;
   const word=overlap(currentText.counts,source.counts);
   const nums=overlap(currentText.numbers,source.numbers);
   const sameInvoice=!!(currentIds.invoice&&ids.invoice&&currentIds.invoice===ids.invoice);
   const samePatient=!!(currentIds.patient&&ids.patient&&currentIds.patient===ids.patient);
   const sameType=/(ha?ematology|biochemistry|serology|crp|cbc)/i.test(current.ocr)&&
       /(ha?ematology|biochemistry|serology|crp|cbc)/i.test(ref.ocr);
   const valueA=clinicalValue(current.ocr),valueB=clinicalValue(ref.ocr);
   const clinicalEqual=!!(valueA&&valueB&&valueA[0]===valueB[0]&&valueA[1]===valueB[1]);
   const clinicalConflict=!!(valueA&&valueB&&valueA[0]===valueB[0]&&valueA[1]!==valueB[1]);
   if(clinicalConflict)continue;
   // Matching invoice numbers have more evidentiary weight than shared layouts.
   const invoiceMatch=sameInvoice&&word>=.63&&nums>=.63;
   const medicalMatch=samePatient&&sameType&&word>=.65&&nums>=.80;
   const clinicalMatch=clinicalEqual&&word>=.72&&nums>=.69;
   const genericMatch=!sameInvoice&&!samePatient&&!clinicalEqual&&word>=.965&&nums>=.965&&similarity(current,ref).visual>=.90;
   if(!(invoiceMatch||medicalMatch||clinicalMatch||genericMatch))continue;
   const score=word*.5+nums*.5;
   if(!best||score>best.score)best={original:j+1,score};
  }
  const override=state.overrides.get(i+1);
  if(override?.type==='confirm'){state.matches.push({page:i+1,original:override.original,manual:true});continue;}
  if(override?.type==='reject'){originals.push(i);continue;}
  if(best){state.matches.push({page:i+1,original:best.original,score:best.score});continue;}
  originals.push(i);
 }
 showResults();
}
function markManual(page,original,confirmed){
 state.overrides.set(page,confirmed?{type:'confirm',original}:{type:'reject'});classify();
}
function showResults(){
 const total=state.signatures.length;$('stats').textContent=total+' pages · '+state.matches.length+' confirmed duplicates · '+state.possible.length+' needs review';
 const parent=$('matches');parent.replaceChildren();
 for(const m of state.matches){
  const box=document.createElement('div');box.className='matchitem';
  const go=document.createElement('button');go.className='match';go.textContent='Page '+m.page+' → D'+m.original+(m.manual?' (confirmed)':'');go.onclick=()=>cards.get(m.page)?.scrollIntoView({behavior:'smooth',block:'center'});
  const undo=document.createElement('button');undo.className='small';undo.textContent='Not duplicate';undo.onclick=()=>markManual(m.page,m.original,false);
  box.append(go,undo);parent.append(box);
 }
 for(const m of state.possible){
  const box=document.createElement('div');box.className='matchitem';
  const go=document.createElement('button');go.className='match possible';go.textContent='Page '+m.page+' → review against '+m.original;go.onclick=()=>cards.get(m.page)?.scrollIntoView({behavior:'smooth',block:'center'});
  const confirm=document.createElement('button');confirm.className='small';confirm.textContent='Confirm D'+m.original;confirm.onclick=()=>markManual(m.page,m.original,true);
  const reject=document.createElement('button');reject.className='small';reject.textContent='Not duplicate';reject.onclick=()=>markManual(m.page,m.original,false);
  box.append(go,confirm,reject);parent.append(box);
 }
 if(!state.matches.length&&!state.possible.length)parent.textContent='No duplicates found. Scans with changed content may require manual checking.';
 renderMarks();$('rescan').disabled=false;$('export').disabled=false;
}
function renderMarks(){
 for(const card of cards.values()){card.querySelector('.overlay')?.remove();card.classList.remove('possiblepage');}
 for(const m of [...state.matches,...($('possible').checked?state.possible:[])]){
  const card=cards.get(m.page);if(!card)continue;
  const confirmed=state.matches.includes(m);const cover=document.createElement('div');cover.className='overlay';
  if(!confirmed)card.classList.add('possiblepage');
  const watermark=document.createElement('span');watermark.className='watermark';watermark.textContent=(confirmed?'D':'?D')+m.original;
  cover.append(watermark);card.append(cover);
 }
}
async function renderCard(n,run){
 if(run!==state.run)return;
 const card=cards.get(n);if(!card||card.dataset.rendered)return;
 card.dataset.rendered='pending';
 try{
  const page=await state.pdf.getPage(n);
  const v=page.getViewport({scale:1});
  const canvas=await renderPage(page,Math.min(1.15,850/v.width));
  if(run!==state.run)return;
  card.prepend(canvas);
  card.dataset.rendered='yes';
  const v2=page.getViewport({scale:1});
  card.style.minHeight=Math.ceil(Math.min(1.15,850/v2.width)*v2.height)+'px';
  // Overlay stays above rendered canvas.
 }catch(err){card.dataset.rendered='';console.error('Page display failed',n,err);}
}
function initVirtualPages(run){
 pageObserver?.disconnect();
 pageObserver=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(entry.isIntersecting){const n=Number(entry.target.dataset.page);pageObserver.unobserve(entry.target);void renderCard(n,run);}
  }
 },{root:$('stage'),rootMargin:'900px 0px'});
 for(let n=1;n<=state.pdf.numPages;n++){
  const card=document.createElement('div');card.className='pagecard';card.id='pdf-page-'+n;card.dataset.page=String(n);
  const label=document.createElement('span');label.className='pagenum';label.textContent='Page '+n;
  card.append(label);card.style.width='min(850px,100%)';card.style.minHeight='1100px';
  $('pages').append(card);cards.set(n,card);pageObserver.observe(card);
 }
}
async function scan(){
 if(!state.pdf)return;
 const run=++state.run;pageObserver?.disconnect();cards.clear();
 state.signatures=[];state.matches=[];state.possible=[];state.ocrReady=false;
 $('pages').replaceChildren();$('matches').replaceChildren();$('rescan').disabled=true;$('export').disabled=true;
 initVirtualPages(run);
 // Lightweight initial pass: no full-size page previews, no OCR yet.
 for(let n=1;n<=state.pdf.numPages;n++){
  if(run!==state.run)return;
  try{
   status('Preparing page '+n+' / '+state.pdf.numPages);
   const page=await state.pdf.getPage(n);const v=page.getViewport({scale:1});
   const mini=await renderPage(page,Math.min(.4,290/v.width));
   const text=await page.getTextContent();
   const sig=signature(mini,textTokens(text));
   sig.ocr=text.items.map(item=>item.str||'').join(' ');
   sig.embedded=sig.ocr.trim().length>80;
   state.signatures.push(sig);
   mini.width=0;mini.height=0;
   // Yield for interaction without timer-based pauses.
   if(n%6===0)await sleepFrame();
  }catch(err){status('Could not prepare page '+n+': '+err.message);console.error(err);return;}
 }
 if(run!==state.run)return;
 await recognizeAll(run);
 if(run!==state.run)return;
 classify();
 status('Analysis complete. Review the duplicates list before downloading the cleaned PDF.');
}
async function downloadClean(){
 if(!state.pdf||!state.bytes)return;
 const duplicates=[...new Set(state.matches.map(m=>m.page))].sort((a,b)=>a-b);
 if(!duplicates.length){status('No confirmed duplicates to remove. Source PDF is already the clean version.');return;}
 const shown=duplicates.length<=16?duplicates.join(', '):duplicates.slice(0,16).join(', ')+', …';
 const ok=confirm('Create a NEW PDF without '+duplicates.length+' marked duplicate page(s)?\\nPages to remove: '+shown+'\\n\\nThe original PDF will not be changed. Please verify these matches first.');
 if(!ok)return;
 const button=$('export');button.disabled=true;
 try{
  status('Saving clean PDF…');
  const {PDFDocument}=globalThis.PDFLib;
  const pdf=await PDFDocument.load(state.bytes,{ignoreEncryption:false});
  // Descending indices ensure that original page numbers are preserved during deletion.
  for(const n of duplicates.slice().reverse())pdf.removePage(n-1);
  const data=await pdf.save({useObjectStreams:true});
  const blob=new Blob([data],{type:'application/pdf'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=state.name.replace(/\\.pdf$/i,'')+'-without-duplicates.pdf';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
  status('Clean PDF downloaded: '+(state.pdf.numPages-duplicates.length)+' pages retained. Original unchanged.');
 }catch(err){status('Clean PDF export failed: '+err.message);console.error(err);}
 finally{button.disabled=false;}
}
async function recognizeAll(run){
 if(typeof Tesseract==='undefined'){status('Offline OCR unavailable; using embedded PDF text where available.');return;}
 // Two workers process separate pages concurrently; tune conservatively to avoid memory spikes.
 const workerCount=Math.min(2,Math.max(1,navigator.hardwareConcurrency||2));
 const workers=[];
 try{
  status('Starting offline OCR ('+workerCount+' workers)…');
  for(let n=0;n<workerCount;n++){
   workers.push(await Tesseract.createWorker('eng',1,{
    workerPath:chrome.runtime.getURL('vendor/ocr/worker.min.js'),
    corePath:chrome.runtime.getURL('vendor/ocr/'),
    langPath:chrome.runtime.getURL('vendor/ocr/'),
    gzip:false,workerBlobURL:false
   }));
  }
  state.ocrReady=true;
  let cursor=0,done=0;
  async function consume(worker){
   for(;;){
    const i=cursor++;if(i>=state.signatures.length||run!==state.run)return;
    const sig=state.signatures[i];
    if(sig.embedded){done++;continue;} // embedded selectable text is already available
    let image;
    try{
     const page=await state.pdf.getPage(i+1),viewport=page.getViewport({scale:1});
     image=await renderPage(page,Math.min(1.5,1100/viewport.width));
     const result=await worker.recognize(image);
     sig.ocr=result?.data?.text||sig.ocr;
    }catch(err){console.warn('OCR failed for page '+(i+1),err);}
    finally{if(image){image.width=0;image.height=0;}}
    done++;
    status('Reading document '+done+' / '+state.signatures.length+' pages (fast parallel OCR)');
   }
  }
  await Promise.all(workers.map(consume));
 }catch(err){console.error('OCR startup failed',err);status('OCR unavailable: '+err.message);}
 finally{await Promise.allSettled(workers.map(w=>w.terminate()));}
}
