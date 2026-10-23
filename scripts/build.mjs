import {backgroundSafePdfJs} from './pdfjs-background.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(path.join(dist,'vendor'),{recursive:true});
for(const f of ['manifest.json','popup.html','popup.css','popup.js','viewer.html','viewer.css','viewer.js','matcher.js','export.js','scanner.js','startup.js','pdf-source.js'])fs.copyFileSync(path.join(root,f),path.join(dist,f));
fs.copyFileSync(path.join(root,'node_modules','pdf-lib','dist','pdf-lib.min.js'),path.join(dist,'vendor','pdf-lib.min.js'));
fs.writeFileSync(path.join(dist,'vendor','pdf.mjs'),backgroundSafePdfJs(fs.readFileSync(path.join(root,'node_modules','pdfjs-dist','build','pdf.mjs'),'utf8')));
fs.copyFileSync(path.join(root,'node_modules','pdfjs-dist','build','pdf.worker.mjs'),path.join(dist,'vendor','pdf.worker.mjs'));

const ocr=path.join(dist,'vendor','ocr');
fs.mkdirSync(ocr,{recursive:true});
const copy=(src,dst)=>{if(!fs.existsSync(src))throw Error('Missing build asset: '+src);fs.copyFileSync(src,dst);};
copy(path.join(root,'node_modules','tesseract.js','dist','tesseract.min.js'),path.join(ocr,'tesseract.min.js'));
copy(path.join(root,'node_modules','tesseract.js','dist','worker.min.js'),path.join(ocr,'worker.min.js'));
const core=path.dirname(require.resolve('tesseract.js-core/package.json',{paths:[path.dirname(require.resolve('tesseract.js/package.json'))]}));
for(const f of fs.readdirSync(core).filter(f=>/^tesseract-core.*\.(wasm|js)$/.test(f)))copy(path.join(core,f),path.join(ocr,f));
if(!fs.readdirSync(ocr).some(f=>f.startsWith('tesseract-core')&&f.endsWith('.wasm.js')))throw Error('OCR WASM core files missing');
copy(path.join(root,'assets','eng.traineddata'),path.join(ocr,'eng.traineddata'));
console.log('Chrome extension and offline OCR assets written to dist/');
// Also provision the source directory: Chrome permits loading its manifest directly.
// Keep generated libraries ignored so both supported unpacked locations work.
fs.cpSync(path.join(dist,'vendor'),path.join(root,'vendor'),{recursive:true});
