import {pdfSource} from './pdf-source.js';
import {recognizeAll as runOcr} from './scanner.js';
import {findDuplicates} from './matcher.js';
import {createCleanPdf} from './export.js';
import * as pdfjsLib from './vendor/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdf.worker.mjs');
const $=id=>document.getElementById(id);
const state={pdf:null,bytes:null,name:'document.pdf',signatures:[],matches:[],possible:[],overrides:new Map(),run:0,ocrReady:false};
const cards=new Map();
let pageObserver=null;
// Scanner does not await requestAnimationFrame: browsers suspend it in hidden tabs.
const MODE=[{name:'High accuracy'},{name:'High accuracy'},{name:'High accuracy'}];
$('threshold').value='0';
const mode=()=>MODE[Number($('threshold').value)];
$('threshold').oninput=()=>{$('thresholdLabel').textContent=mode().name;};
$('threshold').onchange=()=>{if(state.signatures.length)classify();};
$('possible').onchange=renderMarks;
$('file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;status('Opening '+f.name+'…');try{await openPdf(await f.arrayBuffer(),f.name);}catch(err){status('Unable to read selected file: '+err.message);}finally{e.target.value='';}};
$('rescan').onclick=()=>scan();
$('jumpForm').onsubmit=e=>{e.preventDefault();const n=Number($('jump').value);if(!Number.isInteger(n)||n<1||n>cards.size){$('jumpStatus').textContent='Enter a page from 1 to '+cards.size;return;}cards.get(n).scrollIntoView({behavior:'smooth',block:'start'});$('jumpStatus').textContent='Page '+n+' of '+cards.size;};
$('export').onclick=downloadClean;

function status(message){$('progress').textContent=message;}
const params=new URLSearchParams(location.search);
if(params.has('source')){
 const url=params.get('source');status('Importing PDF link…');
 try{const u=new URL(pdfSource(url));const r=await fetch(u.toString(),{credentials:'include'});if(!r.ok)throw Error('HTTP '+r.status);await openPdf(await r.arrayBuffer(),decodeURIComponent(u.pathname.split('/').pop()||'portal.pdf'));}
 catch(e){status('Portal import failed: '+e.message+'. Download that PDF from the portal and choose it here.');}
}
async function openPdf(data,name){
 const run=++state.run;pageObserver?.disconnect();pageObserver=null;state.pdf=null;state.signatures=[];state.matches=[];state.possible=[];state.overrides.clear();cards.clear();
 $('pages').replaceChildren();$('matches').replaceChildren();$('placeholder').hidden=true;$('export').disabled=true;$('rescan').disabled=true;
 try{const bytes=new Uint8Array(data);const pdf=await pdfjsLib.getDocument({data:bytes.slice()}).promise;if(run!==state.run){await pdf.destroy();return;}state.bytes=bytes;state.pdf=pdf;state.name=name;await scan();}
 catch(err){if(run!==state.run)return;status('Unable to load PDF: '+err.message);$('stats').textContent='Could not read PDF';console.error(err);}
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
function classify(){
 state.matches=findDuplicates(state.signatures,state.overrides);
 state.possible=[];
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
   // Do not wait for animation frames: they pause when the tab is hidden.
  }catch(err){if(run!==state.run)return;status('Could not prepare page '+n+': '+err.message);$('rescan').disabled=false;console.error(err);return;}
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
 const ok=confirm('Create a NEW PDF without '+duplicates.length+' marked duplicate page(s)?\\nPages to remove: '+shown+'\n\nThe original PDF will not be changed. Please verify these matches first.');
 if(!ok)return;
 const button=$('export');button.disabled=true;
 try{
  status('Saving clean PDF…');
  const {PDFDocument}=globalThis.PDFLib;
  const data=await createCleanPdf(PDFDocument,state.bytes,state.matches);
  const blob=new Blob([data],{type:'application/pdf'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=state.name.replace(/\.pdf$/i,'')+'-without-duplicates.pdf';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
  status('Clean PDF downloaded: '+(state.pdf.numPages-duplicates.length)+' pages retained. Original unchanged.');
 }catch(err){status('Clean PDF export failed: '+err.message);console.error(err);}
 finally{button.disabled=false;}
}
async function recognizeAll(run){
 return runOcr(run,{state,status,Tesseract:globalThis.Tesseract,chrome,navigator,renderPage});
}
