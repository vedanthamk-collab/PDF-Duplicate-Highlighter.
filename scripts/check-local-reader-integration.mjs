// Real Native Messaging protocol + offline vision model on a synthetic invoice.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {normalizeVision} from '../local-vision.js';
const require=createRequire(import.meta.url),pdfjsPath=require.resolve('pdfjs-dist/build/pdf.mjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[path.dirname(pdfjsPath)]}));
const canvas=createCanvas(1000,700),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,700);ctx.fillStyle='black';ctx.font='36px Arial';
['EXAMPLE PHARMACY','TAX INVOICE','Invoice No: SYN-888','Date: 16-06-2026','Net Amount: INR 1320.57'].forEach((text,i)=>ctx.fillText(text,60,90+i*100));
const child=spawn(process.execPath,['scripts/local-reader-host.mjs'],{windowsHide:true,stdio:['pipe','pipe','inherit']});
let buffer=Buffer.alloc(0),sequence=0;const pending=new Map();
child.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=4&&buffer.length>=4+buffer.readUInt32LE(0)){const size=buffer.readUInt32LE(0),value=JSON.parse(buffer.subarray(4,size+4));buffer=buffer.subarray(size+4);pending.get(value.id)?.(value);pending.delete(value.id);}});
function read(image){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Local inference timed out'));},125000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});const message=Buffer.from(JSON.stringify({id,type:'read',image})),header=Buffer.alloc(4);header.writeUInt32LE(message.length);child.stdin.write(Buffer.concat([header,message]));});}
try{
 const image=canvas.toBuffer('image/jpeg').toString('base64'),start=performance.now();
 const result=await read(image),coldMs=performance.now()-start;
 assert.ok(!result.error,result.error);const row=normalizeVision(result.result);
 assert.equal(row.documentType,'Bill');assert.equal(row.billNo,'SYN-888');assert.equal(row.billDate,'16-06-2026');assert.equal(row.amountCents,132057);
 const warmStart=performance.now(),again=await read(image),warmMs=performance.now()-warmStart;
 assert.equal(again.cacheHit,true);assert.deepEqual(again.result,result.result);
 console.log(JSON.stringify({verified:true,coldMs:Math.round(coldMs),cachedMs:Math.round(warmMs)}));
}finally{child.stdin.end();}
