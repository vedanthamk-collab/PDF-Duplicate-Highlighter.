import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {createCleanPdf} from '../export.js';

async function fixture(){
 const pdf=await PDFDocument.create();
 for(let i=1;i<=7;i++)pdf.addPage([300+i,400+i]);
 return pdf.save();
}
test('production export removes unique confirmed pages and preserves order, source and page contents',async()=>{
 const bytes=await fixture(),original=bytes.slice();
 const result=await PDFDocument.load(await createCleanPdf(PDFDocument,bytes,[{page:2},{page:6},{page:4},{page:2}]));
 assert.deepEqual(result.getPages().map(p=>p.getWidth()),[301,303,305,307]);
 assert.deepEqual(bytes,original);
 assert.equal((await PDFDocument.load(bytes)).getPageCount(),7);
 for(const page of result.getPages())assert.equal(page.node.Annots(),undefined);
});
test('no matches preserves every page',async()=>{
 assert.equal((await PDFDocument.load(await createCleanPdf(PDFDocument,await fixture(),[]))).getPageCount(),7);
});
test('rejects invalid duplicate pages and protects first original',async()=>{
 for(const page of [0,1,8,2.5,NaN])await assert.rejects(createCleanPdf(PDFDocument,await fixture(),[{page}]));
});

test('bill-page export can exclude a non-bill first page and preserves original order and bytes',async()=>{
 const {createSelectedPdf}=await import('../export.js');
 const bytes=await fixture(),before=bytes.slice();
 const selected=await PDFDocument.load(await createSelectedPdf(PDFDocument,bytes,[6,2,4,2]));
 assert.deepEqual(selected.getPages().map(p=>p.getWidth()),[302,304,306]);assert.deepEqual(bytes,before);
 await assert.rejects(createSelectedPdf(PDFDocument,bytes,[]),/No bill/);
 for(const page of [0,8,1.5])await assert.rejects(createSelectedPdf(PDFDocument,bytes,[page]));
});
