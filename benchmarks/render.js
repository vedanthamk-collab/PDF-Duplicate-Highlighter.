import * as before from './pdf-baseline.mjs';
import * as after from '../vendor/pdf.mjs';
for(const lib of [before,after])lib.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdf.worker.mjs');
const output=document.getElementById('result');
const {PDFDocument,StandardFonts,rgb}=globalThis.PDFLib;
let bytes;
async function fixture(){
 if(bytes)return bytes;
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 for(let n=0;n<24;n++){
  const p=doc.addPage([600,800]);
  for(let row=0;row<65;row++){
   p.drawText('Synthetic report '+n+' row '+row+' date 2026/10/22 value '+(row%9),{x:20,y:775-row*11,size:9,font});
   p.drawLine({start:{x:20,y:772-row*11},end:{x:570,y:772-row*11},thickness:.3,color:rgb(.3,.3,.3)});
  }
 }
 bytes=await doc.save();return bytes;
}
async function run(lib){
 const started=performance.now(),pdf=await lib.getDocument({data:(await fixture()).slice()}).promise;
 let hiddenPages=0;const visibilityAtStart=document.visibilityState;
 try{
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),viewport=page.getViewport({scale:.75});
   const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   if(document.hidden)hiddenPages++;
   canvas.width=0;canvas.height=0;
  }
 }finally{await pdf.destroy();}
 return {ms:Math.round(performance.now()-started),hiddenPages,visibilityAtStart};
}
function show(value){output.textContent=JSON.stringify(value,null,2);}
document.getElementById('visible').onclick=async()=>{
 try{await fixture();const results={before:[],after:[]};
 for(let i=0;i<3;i++){show({message:'Foreground run '+(i+1),results});for(const name of i%2?['after','before']:['before','after'])results[name].push(await run(name==='before'?before:after));}
 show(results);
 }catch(error){output.textContent=error.stack;}
};
document.getElementById('hidden').onclick=async()=>{
 try{await fixture();const results={message:'Switch to another tab now. Test starts on visibilitychange to hidden. Return after about 15 seconds.'};show(results);
 const onHidden=()=>{if(!document.hidden)return;document.removeEventListener('visibilitychange',onHidden);
  results.message='Both rendering engines running';show(results);
  for(const [name,lib] of [['before',before],['after',after]])run(lib).then(value=>{results[name]=value;show(results);}).catch(error=>{results[name]={error:error.message};show(results);});
 };document.addEventListener('visibilitychange',onHidden);
 }catch(error){output.textContent=error.stack;}
};
