export async function recognizeAll(run, {state, status, Tesseract, chrome, navigator, renderPage}){
 if(state.signatures.every(sig=>sig.embedded))return;
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
    }catch(err){console.warn('OCR failed for page '+(i+1),err);}
    finally{if(image){image.width=0;image.height=0;}}
    done++;
    if(run===state.run)status('Reading document '+done+' / '+state.signatures.length+' pages (fast parallel OCR)');
   }
  }
  await Promise.all(workers.map(consume));
 }catch(err){console.error('OCR startup failed',err);if(run===state.run)status('OCR unavailable: '+err.message);}
 finally{await Promise.allSettled(workers.map(w=>w.terminate()));}
}
