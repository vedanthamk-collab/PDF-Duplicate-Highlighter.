import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeAll} from '../scanner.js';

function context(signatures){
 const calls={started:0,read:0,terminated:0,status:[]};
 const worker={recognize:async()=>{calls.read++;return {data:{text:'recognized page'}};},terminate:async()=>{calls.terminated++;}};
 return {calls,worker,state:{run:1,signatures,pdf:{getPage:async()=>({getViewport:()=>({width:600})})}},
  status:message=>calls.status.push(message),Tesseract:{createWorker:async()=>{calls.started++;return worker;}},
  chrome:{runtime:{getURL:path=>path}},navigator:{hardwareConcurrency:8},renderPage:async()=>({width:600,height:800})};
}
test('embedded-text documents never initialize OCR',async()=>{
 const ctx=context([{embedded:true}]);
 await recognizeAll(1,ctx);
 assert.equal(ctx.calls.started,0);
});
test('OCR runs without animation frames, skips embedded pages and releases both workers',async()=>{
 const ctx=context([{embedded:true,ocr:'original text'},{embedded:false},{embedded:false}]);
 await recognizeAll(1,ctx);
 assert.equal(ctx.calls.started,2);
 assert.equal(ctx.calls.read,2);
 assert.equal(ctx.calls.terminated,2);
 assert.equal(ctx.state.signatures[0].ocr,'original text');
 assert.equal(ctx.state.signatures[1].ocr,'recognized page');
});
test('superseded OCR cannot publish a result or progress into the next run',async()=>{
 const ctx=context([{embedded:false,ocr:'before'}]);
 ctx.worker.recognize=async()=>{ctx.state.run=2;return {data:{text:'stale result'}};};
 await recognizeAll(1,ctx);
 assert.equal(ctx.state.signatures[0].ocr,'before');
 assert.equal(ctx.calls.terminated,2);
 assert.equal(ctx.calls.status.some(message=>message.startsWith('Reading document')),false);
});
test('partially initialized workers are terminated if startup fails',async()=>{
 const ctx=context([{embedded:false}]);
 ctx.Tesseract.createWorker=async()=>{if(ctx.calls.started++)throw new Error('startup failed');return ctx.worker;};
 await recognizeAll(1,ctx);
 assert.equal(ctx.calls.terminated,1);
 assert.equal(ctx.state.ocrReady,undefined);
});
