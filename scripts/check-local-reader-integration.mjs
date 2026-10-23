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
let buffer=Buffer.alloc(0);
try{
 const result=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Local inference timed out')),240000);
  child.on('error',reject);child.on('exit',code=>{if(code)reject(Error('Reader exited '+code));});
  child.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>=4&&buffer.length>=4+buffer.readUInt32LE(0)){clearTimeout(timer);resolve(JSON.parse(buffer.subarray(4,4+buffer.readUInt32LE(0))));}});
  const message=Buffer.from(JSON.stringify({id:1,type:'read',image:canvas.toBuffer('image/jpeg').toString('base64')})),header=Buffer.alloc(4);header.writeUInt32LE(message.length);child.stdin.write(Buffer.concat([header,message]));
 });
 assert.ok(!result.error,result.error);const row=normalizeVision(result.result);
 assert.equal(row.documentType,'Bill');assert.equal(row.billNo,'SYN-888');assert.equal(row.billDate,'16-06-2026');assert.equal(row.amountCents,132057);
 console.log('Native reader + local vision inference: synthetic bill number, date and amount verified.');
}finally{child.stdin.end();}
