import {recoverBillText} from './bill-ocr.js';
import {needsBillReading} from './bill-plan.js';
export async function recognizeAll(run, {state, status, Tesseract, chrome, navigator, renderPage}){
 if(state.signatures.every(sig=>sig.embedded))return;
 for(const sig of state.signatures)if(!sig.embedded)sig.billingNeedsReview=true;
 if(typeof Tesseract==='undefined'){status('Offline OCR unavailable; using embedded PDF text where available.');return;}
 // Two workers process separate pages concurrently; tune conservatively to avoid memory spikes.
 const workerCount=Math.min(2,Math.max(1,navigator.hardwareConcurrency||2));
 const workers=[];
 try{
  status('Starting offline OCR ('+workerCount+' workers)…');
  for(let n=0;n<workerCount;n++){
   if(run!==state.run)return;
   workers.push(await Tesseract.createWorker('eng',1,{
    workerPath:chrome.runtime.getURL('vendor/ocr/worker.min.js'),
    corePath:chrome.runtime.getURL('vendor/ocr/'),
    langPath:chrome.runtime.getURL('vendor/ocr/'),
    gzip:false,workerBlobURL:false
   }));
  }
  if(run!==state.run)return;
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
     if(run!==state.run)return;
     sig.ocr=result?.data?.text||sig.ocr;
     sig.billingOcr=sig.ocr;sig.billingNeedsReview=Number.isFinite(result?.data?.confidence)&&result.data.confidence<75;
     const needsRecovery=needsBillReading(sig);
     const recovered=needsRecovery?await recoverBillText(worker,result,angle=>{
      if(run===state.run)status('Checking unclear page '+(i+1)+' / '+state.signatures.length+' at higher resolution');
      return renderPage(page,Math.min(3,2200/viewport.width),angle*180/Math.PI);
     },()=>run===state.run):result;
     if(run!==state.run)return;
     sig.billingOcr=recovered?.data?.text||sig.ocr;
     sig.billingRotation=(recovered?.recoveryAngle||0)*180/Math.PI;
     sig.billingNeedsReview=needsRecovery&&Number.isFinite(recovered?.data?.confidence)&&recovered.data.confidence<75;
    }catch(err){console.warn('OCR failed for page '+(i+1),err);}
    finally{if(image){image.width=0;image.height=0;}}
    done++;
    if(run===state.run)status('Reading document '+done+' / '+state.signatures.length+' pages');
   }
  }
  await Promise.all(workers.map(consume));
 }catch(err){console.error('OCR startup failed',err);if(run===state.run)status('OCR unavailable: '+err.message);}
 finally{await Promise.allSettled(workers.map(w=>w.terminate()));}
}
