import test from 'node:test';
import assert from 'node:assert/strict';
import {needsBillReading,planBillReading} from '../bill-plan.js';
import {createReaderCache} from './reader-cache.mjs';
const bill={ocr:'Tax Invoice\nInvoice No: SYN-10\nDate: 27/06/2026\nGrand Total: 473',billingNeedsReview:false};
test('bill planner skips readable bills, duplicates and clear reports but retains unclear expense candidates',()=>{
 const report={ocr:'Thyroid function test\nResult Normal Ranges\nTSH 2.3',billingNeedsReview:true};
 assert.equal(needsBillReading(report),false);assert.equal(needsBillReading(bill),false);
 const financial={ocr:'Tax Invoice\nLab test TSH\nNormal Range\nTOTAL unclear',billingNeedsReview:true};
 assert.equal(needsBillReading(financial),true);
 assert.deepEqual(planBillReading([bill,report,financial,{ocr:'unreadable photo',billingNeedsReview:true}], [{page:4,original:3}]),[2]);
});
test('reader cache reuses exact pages, distinguishes changed images, evicts and refuses cancelled results',async()=>{
 const cache=createReaderCache(1);let calls=0;const read=async()=>({amount:String(++calls)});
 assert.equal((await cache.read('image-a',read)).cacheHit,false);
 assert.equal((await cache.read('image-a',read)).cacheHit,true);assert.equal(calls,1);
 await cache.read('image-b',read);await cache.read('image-a',read);assert.equal(calls,3);
 const controller=new AbortController();controller.abort();await assert.rejects(cache.read('cancelled',read,controller.signal));
 assert.equal((await cache.read('cancelled',read)).cacheHit,false);
});
