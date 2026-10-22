import * as pdfjsLib from './vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdf.worker.mjs');
const $=id=>document.getElementById(id);
const state={pdf:null,bytes:null,thumbs:[],matches:[],possible:[],name:'document.pdf',run:0};
const thresholds=[{label:'Strict',pixel:.045,hash:4},{label:'High',pixel:.075,hash:8},{label:'Moderate',pixel:.115,hash:12}];
const pageEls=new Map();
$('threshold').value='0';
function updateThreshold(){ $('thresholdLabel').textContent=thresholds[+$('threshold').value].label;}
$('threshold').addEventListener('input',updateThreshold);updateThreshold();
$('threshold').addEventListener('change',()=>{if(state.pdf) classifyAndDisplay();});
$('possible').addEventListener('change',()=>drawOverlays());
$('file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;const data=await file.arrayBuffer();await loadPDF(data,file.name);});
$('rescan').onclick=()=>scan();
$('export').onclick=()=>{
const lines=['PDF Duplicate Highlighter — review report',state.name,'Total pages: '+state.thumbs.length,'','Confirmed duplicate pages:'];
for(const m of state.matches)lines.push('Page '+m.page+' → D'+m.original);
lines.push('','Possible matches (review manually):');
for(const m of state.possible)lines.push('Page '+m.page+' → possible D'+m.original);
const blob=new Blob([lines.join('\n')],{type:'text/plain'}),url=URL.createObjectURL(blob);
const a=document.createElement('a');a.href=url;a.download=state.name.replace(/\.pdf$/i,'')+'-duplicate-report.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const params=new URLSearchParams(location.search);
if(params.has('source')){
const source=params.get('source');$('progress').textContent='Trying to import the PDF from the current tab…';
try{const parsed=new URL(source);if(!['https:','http:'].includes(parsed.protocol))throw Error('Unsupported URL');const res=await fetch(parsed.toString(),{credentials:'include'});if(!res.ok)throw Error('HTTP '+res.status);const buffer=await res.arrayBuffer();await loadPDF(buffer,parsed.pathname.split('/').pop()||'portal.pdf');}catch(e){setProgress('Portal import blocked or failed: '+e.message+'. Download the PDF from the portal and select it with Choose PDF.');}
}
function setProgress(t){$('progress').textContent=t;}
async function loadPDF(data,name){
++state.run;state.pdf=null;state.bytes=null;state.thumbs=[];state.matches=[];state.possible=[];pageEls.clear();
$('pages').replaceChildren();$('matches').replaceChildren();$('placeholder').hidden=true;
$('stats').textContent='Loading PDF…';$('rescan').disabled=true;$('export').disabled=true;
try{const bytes=new Uint8Array(data);const pdf=await pdfjsLib.getDocument({data:bytes.slice()}).promise;state.pdf=pdf;state.bytes=bytes;state.name=name;await scan();}
catch(e){setProgress('Could not open PDF: '+e.message);$('stats').textContent='Unable to read this PDF.';console.error(e);}
}
async function pagePixels(page,scale){
const vp=page.getViewport({scale});const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(vp.width));c.height=Math.max(1,Math.ceil(vp.height));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);await page.render({canvasContext:ctx,viewport:vp}).promise;return c;
}
function signature(canvas){
const c=document.createElement('canvas');c.width=64;c.height=84;
const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,64,84);
const ratio=Math.min(64/canvas.width,84/canvas.height),w=canvas.width*ratio,h=canvas.height*ratio;
ctx.drawImage(canvas,(64-w)/2,(84-h)/2,w,h);
const rgba=ctx.getImageData(0,0,64,84).data,gray=new Float32Array(64*84);
let sum=0,sum2=0;
for(let i=0;i<gray.length;i++){const j=i*4;const g=.299*rgba[j]+.587*rgba[j+1]+.114*rgba[j+2];gray[i]=g;sum+=g;sum2+=g*g;}
const avg=sum/gray.length,std=Math.sqrt(Math.max(0,sum2/gray.length-avg*avg));
const norm=new Uint8Array(gray.length);
for(let i=0;i<gray.length;i++)norm[i]=Math.min(255,Math.max(0,128+(gray[i]-avg)*Math.min(1.8,42/Math.max(std,1))));
let ink=0;for(let i=0;i<gray.length;i++)if(gray[i]<220)ink++;
// A dHash across the 64x84 thumbnail; keeps scan-cost bounded.
const bits=new Uint8Array(9*8);
let k=0;for(let y=4;y<84;y+=10){for(let x=0;x<63;x+=7)bits[k++]=gray[y*64+x]>gray[y*64+x+1]?1:0;}
return {norm,bits,ink:ink/gray.length,std,raw:gray};
}
function diff(a,b){
let err=0,rawerr=0,hash=0;const n=a.norm.length;
for(let i=0;i<n;i++){err+=Math.abs(a.norm[i]-b.norm[i]);rawerr+=Math.abs(a.raw[i]-b.raw[i]);}
for(let i=0;i<a.bits.length;i++)hash+=a.bits[i]!==b.bits[i]?1:0;
return {pixel:err/n/255,raw:rawerr/n/255,hash};
}
function findMatches(){
const selected=thresholds[+$('threshold').value];
state.matches=[];state.possible=[];const originals=[];
for(let i=0;i<state.thumbs.length;i++){
const current=state.thumbs[i];if(current.ink<.012||current.std<10){originals.push(i);continue;}
let best=null;
for(const j of originals){const ref=state.thumbs[j];if(Math.abs(ref.ink-current.ink)>.14)continue;
const d=diff(current,ref);const score=d.pixel+.2*d.raw;
if(!best||score<best.score)best={original:j+1,score,...d};
}
if(best&&best.pixel<=selected.pixel&&best.raw<=selected.pixel*1.25&&best.hash<=selected.hash){
state.matches.push({page:i+1,original:best.original,pixel:best.pixel});continue;
}
if(best&&best.pixel<=selected.pixel*1.55&&best.raw<=selected.pixel*1.6&&best.hash<=selected.hash+6){
state.possible.push({page:i+1,original:best.original});}
originals.push(i);
}
}
function showResults(){
const total=state.thumbs.length;
$('stats').textContent=total+' pages · '+(total-state.matches.length)+' not confirmed duplicates · '+state.matches.length+' duplicates · '+state.possible.length+' possible matches';
$('matches').replaceChildren();
for(const m of state.matches){const b=document.createElement('button');b.className='match';b.textContent='Page '+m.page+' → D'+m.original;b.onclick=()=>pageEls.get(m.page)?.scrollIntoView({behavior:'smooth',block:'center'});$('matches').append(b);}
for(const m of state.possible){const b=document.createElement('button');b.className='match possible';b.textContent='Page '+m.page+' → possible D'+m.original;b.onclick=()=>pageEls.get(m.page)?.scrollIntoView({behavior:'smooth',block:'center'});$('matches').append(b);}
if(!state.matches.length&&!state.possible.length)$('matches').textContent='No duplicate pages detected at this threshold.';
drawOverlays();
$('export').disabled=false;$('rescan').disabled=false;
}
function drawOverlays(){
for(const el of pageEls.values()){el.classList.remove('possiblepage');el.querySelector('.overlay')?.remove();}
for(const m of [...state.matches,...($('possible').checked?state.possible:[])]){
const el=pageEls.get(m.page);if(!el)continue;const uncertain=state.possible.includes(m);
if(uncertain)el.classList.add('possiblepage');
const overlay=document.createElement('div');overlay.className='overlay';
const mark=document.createElement('div');mark.className='watermark';mark.textContent=(uncertain?'?D':'D')+m.original;
overlay.append(mark);el.append(overlay);
}
}
function classifyAndDisplay(){findMatches();showResults();}
async function scan(){
if(!state.pdf)return;const run=++state.run;state.thumbs=[];state.matches=[];state.possible=[];pageEls.clear();
$('pages').replaceChildren();$('rescan').disabled=true;$('export').disabled=true;
const pdf=state.pdf;const maxScale=1.15;
for(let n=1;n<=pdf.numPages;n++){
if(run!==state.run)return;
try{
setProgress('Scanning '+n+' / '+pdf.numPages+' pages');
const page=await pdf.getPage(n);
const thumb=await pagePixels(page,Math.min(.55,180/page.getViewport({scale:1}).width));
state.thumbs.push(signature(thumb));thumb.width=0;thumb.height=0;
const viewport=page.getViewport({scale:Math.min(maxScale,850/page.getViewport({scale:1}).width)});
const canvas=await pagePixels(page,viewport.scale);
const el=document.createElement('div');el.className='pagecard';el.id='pdf-page-'+n;el.append(canvas);
const num=document.createElement('span');num.className='pagenum';num.textContent='Page '+n;el.append(num);
$('pages').append(el);pageEls.set(n,el);page.cleanup();
}catch(e){setProgress('Page '+n+' failed: '+e.message);throw e;}
}
if(run!==state.run)return;classifyAndDisplay();setProgress('Scan completed. Review duplicate markings before skipping documents.');
}
