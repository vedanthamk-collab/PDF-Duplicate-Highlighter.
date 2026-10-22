import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(path.join(dist,'vendor'),{recursive:true});
for(const f of ['manifest.json','popup.html','popup.js','viewer.html','viewer.css','viewer.js'])fs.copyFileSync(path.join(root,f),path.join(dist,f));
for(const f of ['pdf.mjs','pdf.worker.mjs'])fs.copyFileSync(path.join(root,'node_modules','pdfjs-dist','build',f),path.join(dist,'vendor',f));
console.log('Chrome extension written to dist/');
