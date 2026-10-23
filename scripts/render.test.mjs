import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {backgroundSafePdfJs} from './pdfjs-background.mjs';
const require=createRequire(import.meta.url);
const pdfjsPath=require.resolve('pdfjs-dist/build/pdf.mjs');
const {createCanvas,Path2D,DOMMatrix,ImageData}=require(require.resolve('@napi-rs/canvas',{paths:[path.dirname(pdfjsPath)]}));

Object.assign(globalThis,{Path2D,DOMMatrix,ImageData});
async function fixture(){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let n=0;n<3;n++){
  const page=pdf.addPage([360,480]);
  page.drawText('Synthetic report 12345678 date 2026/10/22 value '+n,{x:18,y:420,size:11,font});
  for(let row=0;row<120;row++)page.drawRectangle({x:20+(row%5)*55,y:10+Math.floor(row/5)*15,width:45,height:8,color:rgb(.1,.2,.3)});
 }
 const field=pdf.getForm().createTextField('syntheticValue');field.setText('value 17');field.addToPage(pdf.getPage(0),{x:20,y:370,width:150,height:25});
 pdf.getForm().updateFieldAppearances(font);
 return pdf.save();
}
async function raster(lib,bytes){
 lib.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(path.dirname(pdfjsPath),'pdf.worker.mjs')).href;
 const pdf=await lib.getDocument({data:bytes.slice(),standardFontDataUrl:path.join(path.dirname(pdfjsPath),'..','standard_fonts')+path.sep}).promise;
 const pixels=[];
 try{
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),viewport=page.getViewport({scale:.8});
   const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext('2d');
   await page.render({canvasContext:context,viewport}).promise;
   pixels.push(context.getImageData(0,0,canvas.width,canvas.height).data);
  }
 }finally{await pdf.destroy();}
 return pixels;
}
test('real PDF.js renders identical pixels without animation frames, including form values',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'pdf-background-'));
 const previousWindow=globalThis.window;
 try{
  const patchedPath=path.join(dir,'pdf.mjs');
  await writeFile(patchedPath,backgroundSafePdfJs(await readFile(pdfjsPath,'utf8')));
  const baseline=await import(pathToFileURL(pdfjsPath).href);
  const patched=await import(pathToFileURL(patchedPath).href);
  let frames=0;
  globalThis.window={requestAnimationFrame:callback=>{frames++;return setTimeout(callback,1);},cancelAnimationFrame:clearTimeout};
  const bytes=await fixture(),original=bytes.slice();
  const expected=await raster(baseline,bytes);
  assert.ok(frames>0,'baseline actually schedules animation frames');
  globalThis.window={requestAnimationFrame:()=>{throw new Error('hidden-tab animation frames unavailable');},cancelAnimationFrame:()=>{}};
  const actual=await raster(patched,bytes);
  assert.deepEqual(actual,expected);
  assert.deepEqual(bytes,original);
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;await rm(dir,{recursive:true,force:true});}
});
