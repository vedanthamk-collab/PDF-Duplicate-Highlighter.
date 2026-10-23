// Real offline OCR of a synthetic sideways invoice; no user documents.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import Tesseract from 'tesseract.js';
import {recoverBillText} from '../bill-ocr.js';
import {buildBillLedger} from '../billing.js';
const require=createRequire(import.meta.url),pdfjsPath=require.resolve('pdfjs-dist/build/pdf.mjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[path.dirname(pdfjsPath)]}));
const upright=createCanvas(1100,750),ctx=upright.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1100,750);ctx.fillStyle='black';ctx.font='36px Arial';
['EXAMPLE PHARMACY','TAX INVOICE','Invoice No: SYN-888','Date: 16/06/2026','Medicines and supplies','Net Amount: INR 1320.57'].forEach((text,i)=>ctx.fillText(text,80,90+i*90));
function image(angle){const total=angle+Math.PI/2,swap=Math.abs(Math.sin(total))>.5,c=createCanvas(swap?750:1100,swap?1100:750),context=c.getContext('2d');context.translate(c.width/2,c.height/2);context.rotate(total);context.drawImage(upright,-550,-375);return c.toBuffer('image/png');}
const worker=await Tesseract.createWorker('eng',1,{langPath:path.resolve('assets'),gzip:false,cacheMethod:'none'});
try{
 const initial=await worker.recognize(image(0));
 const recovered=await recoverBillText(worker,initial,async angle=>image(angle));
 const [row]=buildBillLedger([{ocr:recovered.data.text}]);
 assert.equal(row.billNo,'SYN-888');assert.equal(row.billDate,'16/06/2026');assert.equal(row.amountCents,132057);
 console.log(JSON.stringify({initialConfidence:initial.data.confidence,recoveredConfidence:recovered.data.confidence,billNo:row.billNo,amountCents:row.amountCents}));
}finally{await worker.terminate();}
