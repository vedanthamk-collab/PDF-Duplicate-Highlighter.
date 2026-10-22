import * as pdfjsLib from './vendor/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdf.worker.mjs');
const $=id=>document.getElementById(id);
const state={pdf:null,bytes:null,name:'document.pdf',signatures:[],matches:[],possible:[],overrides:new Map(),run:0};
const cards=new Map();
const MODE=[{name:'Very strict',confirmed:.995,review:.91},{name:'Strict',confirmed:.99,review:.87},{name:'Review more',confirmed:.985,review:.82}];
$('threshold').value='0';
const mode=()=>MODE[Number($('threshold').value)];
$('threshold').oninput=()=>{$('thresholdLabel').textContent=mode().name;};
$('threshold').onchange=()=>{if(state.signatures.length)classify();};
$('possible').onchange=renderMarks;
$('file').onchange=async e=>{const f=e.target.files?.[0];if(f)await openPdf(await f.arrayBuffer(),f.name);e.target.value='';};
$('rescan').onclick=()=>scan();
$('jumpForm').onsubmit=e=>{e.preventDefault();const n=Number($('jump').value);if(!Number.isInteger(n)||n<1||n>cards.size){$('jumpStatus').textContent='Enter a page from 1 to '+cards.size;return;}cards.get(n).scrollIntoView({behavior:'smooth',block:'start'});$('jumpStatus').textContent='Page '+n+' of '+cards.size;};
$('export').onclick=downloadAnnotated;

function status(message){$('progress').textContent=message;}
const params=new URLSearchParams(location.search);
if(params.has('source')){
 const url=params.get('source');status('Importing PDF link…');
 try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error('Unsupported URL');const r=await fetch(u.toString(),{credentials:'include'});if(!r.ok)throw Error('HTTP '+r.status);await openPdf(await r.arrayBuffer(),decodeURIComponent(u.pathname.split('/').pop()||'portal.pdf'));}
 catch(e){status('Portal import failed: '+e.message+'. Download that PDF from the portal and choose it here.');}
}
async function openPdf(data,name){
 ++state.run;state.pdf=null;state.signatures=[];state.matches=[];state.possible=[];state.overrides.clear();cards.clear();
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
function classify(){
 state.matches=[];state.possible=[];const settings=mode(),keepers=[];
 for(let i=0;i<state.signatures.length;i++){
  const sig=state.signatures[i];let best=null;
  for(const j of keepers){
   const candidate=state.signatures[j];const s=similarity(sig,candidate);
   // When text exists, conflicting words/numbers must prevent automatic duplicate marking.
   const textConflict=s.semantic!==null&&s.semantic<.985;
   if(textConflict&&s.visual<.985)continue;
   const combined=s.visual;
   if(!best||combined>best.visual)best={page:i+1,original:j+1,...s,textConflict};
  }
  const override=state.overrides.get(i+1);
  if(override?.type==='confirm'){state.matches.push({page:i+1,original:override.original,manual:true});continue;}
  if(override?.type==='reject'){keepers.push(i);continue;}
  // Auto-confirm only essentially identical printed foreground AND nonconflicting text.
  if(best&&!best.textConflict&&best.visual>=settings.confirmed){
   state.matches.push({page:i+1,original:best.original,score:best.visual});continue;
  }
  if(best&&best.visual>=settings.review){
   state.possible.push({page:i+1,original:best.original,score:best.visual});
  }
  keepers.push(i);
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
async function scan(){
 if(!state.pdf)return;const run=++state.run;cards.clear();state.signatures=[];state.matches=[];state.possible=[];
 $('pages').replaceChildren();$('rescan').disabled=true;$('export').disabled=true;
 for(let n=1;n<=state.pdf.numPages;n++){
  if(run!==state.run)return;
  try{
   status('Scanning '+n+' / '+state.pdf.numPages+' pages');
   const page=await state.pdf.getPage(n);const v=page.getViewport({scale:1});
   const mini=await renderPage(page,Math.min(.55,380/v.width)); // more detail than old 180 px pass
   const text=await page.getTextContent();
   state.signatures.push(signature(mini,textTokens(text)));
   mini.width=0;mini.height=0;
   const display=await renderPage(page,Math.min(1.15,850/v.width));
   const card=document.createElement('div');card.className='pagecard';card.id='pdf-page-'+n;card.append(display);
   const lbl=document.createElement('span');lbl.className='pagenum';lbl.textContent='Page '+n;card.append(lbl);
   $('pages').append(card);cards.set(n,card);page.cleanup();
  }catch(e){status('Error at page '+n+': '+e.message);console.error(e);return;}
 }
 if(run!==state.run)return;classify();status('Finished. Review all proposed matches before skipping pages.');
}
async function downloadAnnotated(){
 if(!state.pdf||!state.bytes)return;
 const btn=$('export');btn.disabled=true;
 try{
  status('Generating annotated PDF locally… This can take longer for large scanned files.');
  const {PDFDocument,rgb,degrees,StandardFonts}=globalThis.PDFLib;
  if(!PDFDocument)throw Error('PDF export engine was not loaded.');
  const pdf=await PDFDocument.load(state.bytes,{ignoreEncryption:false});
  const font=await pdf.embedFont(StandardFonts.HelveticaBold);
  for(const m of state.matches){
   const p=pdf.getPage(m.page-1);
   const width=p.getWidth(),height=p.getHeight();
   p.drawRectangle({x:0,y:0,width,height,color:rgb(1,.86,.3),opacity:.17,borderWidth:0});
   const label='D'+m.original,size=Math.min(width/3,110),textWidth=font.widthOfTextAtSize(label,size);
   p.drawText(label,{x:Math.max(12,(width-textWidth)/2),y:height/2,size,font,color:rgb(.55,.4,.07),opacity:.36});
  }
  const output=await pdf.save({useObjectStreams:true});
  const blob=new Blob([output],{type:'application/pdf'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=state.name.replace(/\.pdf$/i,'')+'-duplicates-marked.pdf';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
  status('Annotated PDF downloaded. Original source file is unchanged. Only confirmed duplicates were marked.');
 }catch(e){status('Could not export PDF: '+e.message);console.error(e);}
 finally{btn.disabled=false;}
}
