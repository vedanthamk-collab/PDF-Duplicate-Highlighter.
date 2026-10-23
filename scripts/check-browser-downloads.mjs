// Compare known synthetic Chrome downloads with independently generated exports.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const pdfjsPath=require.resolve('pdfjs-dist/build/pdf.mjs');
const native=require(require.resolve('@napi-rs/canvas',{paths:[path.dirname(pdfjsPath)]}));
Object.assign(globalThis,{DOMMatrix:native.DOMMatrix,Path2D:native.Path2D,ImageData:native.ImageData});
const pdfjs=await import(pathToFileURL(pdfjsPath).href);
pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(path.dirname(pdfjsPath),'pdf.worker.mjs')).href;
class CanvasFactory {
 create(w,h){const canvas=native.createCanvas(w,h);return {canvas,context:canvas.getContext('2d')};}
 reset(target,w,h){target.canvas.width=w;target.canvas.height=h;}
 destroy(target){target.canvas.width=0;target.canvas.height=0;}
}
const downloads=process.argv[2];
assert.ok(downloads,'Pass the directory containing the known synthetic Chrome downloads.');
async function render(file){
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await fs.readFile(file)),CanvasFactory,standardFontDataUrl:path.join(path.dirname(pdfjsPath),'..','standard_fonts')+path.sep}).promise;
 try {const pages=[];for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),viewport=page.getViewport({scale:1});
  const canvas=native.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  pages.push({width:canvas.width,height:canvas.height,pixels:Buffer.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data)});
 }return pages;}finally{await pdf.destroy();}
}
for(const [name,expected,count] of [['all-pages','all-pages',5],['without-duplicates','clean',4],['bills-receipts','bills-receipts',3]]){
 const actual=await render(path.join(downloads,`combined-claims-${name}.pdf`));
 const baseline=await render(path.resolve('tmp/claims-fixtures',`${expected}.pdf`));
 assert.equal(actual.length,count);assert.deepEqual(actual,baseline,`${name}: page order and pixels must match unmarked expected export`);
 console.log(`${name}: ${count} pages, exact rendered pixels and page order verified.`);
}
