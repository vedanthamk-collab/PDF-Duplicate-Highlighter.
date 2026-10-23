import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVision,connectLocalReader} from '../local-vision.js';
import {buildBillLedger,summarizeBills} from '../billing.js';
const sample=()=>({documentType:'Bill',billNo:'SYN-81',billDate:'27-06-2026',billType:'Pharmacy',amount:'473.00',currency:'INR',referenceNo:'',serviceReceipt:false,remarks:''});
test('local image extraction validates calendar, money and fields; malformed output cannot create an expense',()=>{
 const value=normalizeVision(sample());assert.equal(value.amountCents,47300);assert.equal(value.billDate,'27-06-2026');
 const invalid=normalizeVision({...sample(),billDate:'31-02-2026',amount:'4O3'});assert.equal(invalid.amountCents,null);assert.equal(invalid.billDate,'');assert.ok(invalid.issues.length>=2);
 const shortYear=normalizeVision({...sample(),billDate:'27/06/26'});assert.equal(shortYear.billDate,'27-06-2026');assert.match(shortYear.advisories.join(),/Short year/);
 assert.throws(()=>normalizeVision({...sample(),documentType:'run command'}));assert.throws(()=>normalizeVision({...sample(),currency:'XYZ'}));
});
test('local AI fills unread bills without changing matching OCR; totals stay draft and linked receipts are excluded',()=>{
 const bill=normalizeVision(sample()),receipt=normalizeVision({...sample(),documentType:'Receipt',billNo:'SYN-R',referenceNo:'SYN-81',serviceReceipt:false});
 const signatures=[{ocr:'unreadable',vision:bill},{ocr:'unreadable payment',vision:receipt}];
 const rows=buildBillLedger(signatures);assert.equal(summarizeBills(rows).totalCents,47300);assert.equal(rows[0].reviewed,false);assert.match(rows[0].issues.join(),/verify source/);assert.equal(rows[1].included,false);assert.equal(signatures[0].ocr,'unreadable');
 assert.equal(buildBillLedger([{ocr:'Example Nursing Home',vision:bill}])[0].billType,'Hospital');
 assert.equal(buildBillLedger(signatures,[],[{page:1,original:2}]).filter(r=>r.documentType==='Bill').length,0);
});
test('local image service receipt is a draft expense but a payment against a separate bill cannot be added again',()=>{
 const service=normalizeVision({...sample(),documentType:'Receipt',serviceReceipt:true});
 assert.equal(summarizeBills(buildBillLedger([{vision:service}])).totalCents,47300);
 const bill=normalizeVision(sample());service.referenceNo=bill.billNo;service.billNo='SYN-PAY';
 assert.equal(summarizeBills(buildBillLedger([{vision:bill},{vision:service}])).totalCents,47300);
});
test('native messaging correlates replies and cancellation without accepting stale output',async()=>{
 let receive,disconnect;const sent=[],port={onMessage:{addListener:f=>receive=f},onDisconnect:{addListener:f=>disconnect=f},postMessage:m=>sent.push(m),disconnect:()=>disconnect()};
 const reader=connectLocalReader({connectNative:()=>port});const pending=reader.request({type:'hello'});receive({id:sent[0].id,result:{available:true}});assert.deepEqual(await pending,{available:true});
 const controller=new AbortController(),cancelled=reader.request({type:'read',image:'synthetic'},controller.signal);controller.abort();await assert.rejects(cancelled,/cancelled/);assert.equal(sent.at(-1).type,'cancel');receive({id:sent[1].id,result:sample()});reader.close();
});
test('a stalled native page request is cancelled on its deadline rather than blocking indefinitely',async()=>{
 let disconnect;const sent=[],port={onMessage:{addListener:()=>{}},onDisconnect:{addListener:f=>disconnect=f},postMessage:m=>sent.push(m),disconnect:()=>disconnect()};
 const reader=connectLocalReader({connectNative:()=>port},{timeoutMs:5});
 await assert.rejects(reader.request({type:'read',image:'synthetic'}),/page limit/);assert.equal(sent.at(-1).type,'cancel');reader.close();
});
