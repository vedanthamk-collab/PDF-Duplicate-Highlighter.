import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverBillText} from '../bill-ocr.js';
test('strong OCR avoids retries; weak OCR chooses strongest orientation and releases image',async()=>{
 const strong={data:{confidence:90,text:'clear invoice'}};
 assert.equal(await recoverBillText({},strong,()=>{throw Error('unnecessary render');}),strong);
 const images=[],angles=[];
 const worker={recognize:async image=>({data:{confidence:image.angle===Math.PI/2?92:60,text:'invoice date total'}})};
 const result=await recoverBillText(worker,{data:{confidence:35,text:'sideways'}},async angle=>{angles.push(angle);const image={width:2200,height:3000,angle};images.push(image);return image;});
 assert.equal(result.data.confidence,92);assert.deepEqual(angles,[0,Math.PI/2]);assert.ok(images.every(image=>image.width===0&&image.height===0));
});
test('cancelled OCR recovery does not start another recognition and releases image',async()=>{
 const image={width:1,height:1},initial={data:{confidence:30,text:'original'}};
 assert.equal(await recoverBillText({recognize:()=>{throw Error('stale');}},initial,async()=>image,()=>false),initial);
 assert.equal(image.width,1,'cancelled recovery never allocates an image');
});
