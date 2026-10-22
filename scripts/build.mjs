import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(path.join(dist,'vendor'),{recursive:true});
for(const f of ['manifest.json','popup.html','popup.js','viewer.html','viewer.css','viewer.js'])fs.copyFileSync(path.join(root,f),path.join(dist,f));
fs.copyFileSync(path.join(root,'node_modules','pdf-lib','dist','pdf-lib.min.js'),path.join(dist,'vendor','pdf-lib.min.js'));
for(const f of ['pdf.mjs','pdf.worker.mjs'])fs.copyFileSync(path.join(root,'node_modules','pdfjs-dist','build',f),path.join(dist,'vendor',f));

const ocr=path.join(dist,'vendor','ocr');
fs.mkdirSync(ocr,{recursive:true});
const copy=(src,dst)=>{if(!fs.existsSync(src))throw Error('Missing build asset: '+src);fs.copyFileSync(src,dst);};
copy(path.join(root,'node_modules','tesseract.js','dist','tesseract.min.js'),path.join(ocr,'tesseract.min.js'));
copy(path.join(root,'node_modules','tesseract.js','dist','worker.min.js'),path.join(ocr,'worker.min.js'));
const core=path.join(root,'node_modules','tesseract.js-core');
for(const f of fs.readdirSync(core).filter(f=>/^tesseract-core.*\\.(wasm|js)$/.test(f)))copy(path.join(core,f),path.join(ocr,f));
copy(path.join(root,'assets','eng.traineddata'),path.join(ocr,'eng.traineddata'));
console.log('Chrome extension and offline OCR assets written to dist/');

