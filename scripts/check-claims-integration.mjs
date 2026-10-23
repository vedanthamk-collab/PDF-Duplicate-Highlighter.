// End-to-end local library check using generated PDFs, PNG and JPEG plus real offline OCR.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PDFDocument} from 'pdf-lib';
import Tesseract from 'tesseract.js';
import {mergeDocuments} from '../documents.js';
import {recognizeAll} from '../scanner.js';
import {findDuplicates} from '../matcher.js';
import {buildBillLedger,summarizeBills,tableToTsv,billTableData} from '../billing.js';
import {createCleanPdf,createSelectedPdf} from '../export.js';
await import('./generate-claims-fixtures.mjs');
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pdfjsPath=require.resolve('pdfjs-dist/build/pdf.mjs');
const native=require(require.resolve('@napi-rs/canvas',{paths:[path.dirname(pdfjsPath)]}));
Object.assign(globalThis,{DOMMatrix:native.DOMMatrix,Path2D:native.Path2D,ImageData:native.ImageData});
const pdfjs=await import(pathToFileURL(path.join(root,'vendor','pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(path.dirname(pdfjsPath),'pdf.worker.mjs')).href;
const names=['01-invoice.pdf','02-receipt.pdf','03-pharmacy.jpg','04-report.png'];
const files=await Promise.all(names.map(async name=>({name,bytes:new Uint8Array(await fs.readFile(path.join(root,'tmp','claims-fixtures',name)))})));
const merged=await mergeDocuments(PDFDocument,files);
class CanvasFactory{create(width,height){const canvas=native.createCanvas(width,height);return {canvas,context:canvas.getContext('2d')};}reset(target,width,height){target.canvas.width=width;target.canvas.height=height;}destroy(target){target.canvas.width=0;target.canvas.height=0;target.canvas=null;target.context=null;}}
const pdf=await pdfjs.getDocument({data:merged.bytes.slice(),CanvasFactory,standardFontDataUrl:path.join(path.dirname(pdfjsPath),'..','standard_fonts')+path.sep}).promise;
const state={pdf,run:1,signatures:[]};
try{
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),content=await page.getTextContent(),ocr=content.items.map(i=>(i.str||'')+(i.hasEOL?'\n':' ')).join('');
  const viewport=page.getViewport({scale:96/page.getViewport({scale:1}).width});
  const canvas=native.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext('2d');
  await page.render({canvasContext:context,viewport}).promise;const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
  const gray=new Uint8Array(canvas.width*canvas.height),dark=new Uint8Array(gray.length);
  for(let i=0;i<gray.length;i++){gray[i]=Math.round((rgba[i*4]+rgba[i*4+1]+rgba[i*4+2])/3);dark[i]=gray[i]<190?1:0;}
  state.signatures.push({ocr,embedded:ocr.trim().length>80,rotations:[{gray,dark,w:canvas.width,h:canvas.height}]});
 }
 await recognizeAll(1,{state,status:message=>console.log(message),chrome:{runtime:{getURL:x=>x}},navigator:{hardwareConcurrency:2},
  Tesseract:{createWorker:(language,oem)=>Tesseract.createWorker(language,oem,{langPath:path.join(root,'assets'),gzip:false,cacheMethod:'none'})},
  renderPage:async(page,scale)=>{const viewport=page.getViewport({scale}),canvas=native.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return canvas.toBuffer('image/png');}});
 assert.equal(state.ocrReady,true,'real offline OCR initialized');
 const matches=findDuplicates(state.signatures),rows=buildBillLedger(state.signatures,merged.provenance,matches),sum=summarizeBills(rows);
 const result={pages:pdf.numPages,duplicates:matches.map(m=>[m.page,m.original]),bills:rows.filter(r=>r.documentType==='Bill').length,receipts:rows.filter(r=>r.documentType==='Receipt').length,excluded:rows.filter(r=>r.documentType==='Other').length,totalCents:sum.totalCents,rows};
 console.log(JSON.stringify(result,null,2));
 assert.equal(result.pages,5);assert.deepEqual(result.duplicates,[[2,1]]);assert.equal(result.bills,2);assert.equal(result.receipts,1);assert.equal(result.excluded,1);assert.equal(result.totalCents,173450);
 const clean=await createCleanPdf(PDFDocument,merged.bytes,matches);assert.equal((await PDFDocument.load(clean)).getPageCount(),4);
 const bills=await createSelectedPdf(PDFDocument,merged.bytes,rows.filter(r=>r.documentType!=='Other').flatMap(r=>r.pages));assert.equal((await PDFDocument.load(bills)).getPageCount(),3);
 await fs.writeFile(path.join(root,'tmp','claims-fixtures','all-pages.pdf'),merged.bytes);
 await fs.writeFile(path.join(root,'tmp','claims-fixtures','clean.pdf'),clean);
 await fs.writeFile(path.join(root,'tmp','claims-fixtures','bills-receipts.pdf'),bills);
 await fs.writeFile(path.join(root,'tmp','claims-fixtures','bill-table.tsv'),tableToTsv(billTableData(rows)));
 await fs.writeFile(path.join(root,'tmp','claims-fixtures','result.json'),JSON.stringify(result,null,2));
 console.log('Real offline OCR + mixed merge + duplicate detection + bill totals + exports verified.');
}finally{await pdf.destroy();}
