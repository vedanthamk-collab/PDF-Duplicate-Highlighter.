import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {createRequire} from 'node:module';
import path from 'node:path';
import {mergeDocuments,fileKind,jpegNeedsOrientation} from '../documents.js';
import {createCleanPdf} from '../export.js';
const require=createRequire(import.meta.url),{createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[path.dirname(require.resolve('pdfjs-dist/package.json'))]}));
async function pdf(widths){const doc=await PDFDocument.create();widths.forEach(w=>doc.addPage([w,400]));return doc.save();}
function image(kind){const canvas=createCanvas(40,60);const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,40,60);return new Uint8Array(canvas.toBuffer(kind==='png'?'image/png':'image/jpeg'));}
test('production merger preserves mixed-file order, PDF page order, dimensions and provenance',async()=>{
 const files=[{name:'first.pdf',bytes:await pdf([301,302])},{name:'photo.png',bytes:image('png')},{name:'last.pdf',bytes:await pdf([303])},{name:'receipt.jpg',bytes:image('jpg')}];
 const originals=files.map(f=>f.bytes.slice());const result=await mergeDocuments(PDFDocument,files);const output=await PDFDocument.load(result.bytes);
 assert.deepEqual(output.getPages().map(p=>p.getWidth()),[301,302,40,303,40]);
 assert.deepEqual(result.provenance.map(p=>[p.fileName,p.sourcePage]),[['first.pdf',1],['first.pdf',2],['photo.png',1],['last.pdf',1],['receipt.jpg',1]]);
 files.forEach((file,i)=>assert.deepEqual(file.bytes,originals[i]));
 const clean=await PDFDocument.load(await createCleanPdf(PDFDocument,result.bytes,[{page:2,original:1}]));assert.deepEqual(clean.getPages().map(p=>p.getWidth()),[301,40,303,40]);
 for(const page of output.getPages())assert.equal(page.node.Annots()?.size()||0,0);
});
test('reordered inputs determine export order',async()=>{
 const result=await mergeDocuments(PDFDocument,[{name:'b.pdf',bytes:await pdf([450])},{name:'a.pdf',bytes:await pdf([300])}]);assert.deepEqual((await PDFDocument.load(result.bytes)).getPages().map(p=>p.getWidth()),[450,300]);
});
test('200 synthetic pages merge without truncation',async()=>{
 const result=await mergeDocuments(PDFDocument,[{name:'a.pdf',bytes:await pdf(Array(100).fill(300))},{name:'b.pdf',bytes:await pdf(Array(100).fill(400))}]);assert.equal((await PDFDocument.load(result.bytes)).getPageCount(),200);assert.equal(result.provenance[199].sourcePage,100);
});
test('unsupported/corrupt inputs fail atomically with source filename',async()=>{
 await assert.rejects(mergeDocuments(PDFDocument,[]),/Choose/);
 await assert.rejects(mergeDocuments(PDFDocument,[{name:'broken.png',bytes:new Uint8Array([1,2,3])}]),/broken.png/);
 await assert.rejects(mergeDocuments(PDFDocument,[{name:'fake.pdf',bytes:new TextEncoder().encode('%PDF-broken')}]),/fake.pdf/);
});
test('uses bytes rather than a misleading filename to identify format',()=>{
 assert.equal(fileKind('wrong.pdf',image('png')),'png');assert.equal(fileKind('wrong.png',image('jpg')),'jpg');assert.equal(jpegNeedsOrientation(image('jpg')),false);
});
