import {copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
await copyFile(require.resolve('pdfjs-dist/build/pdf.mjs'),new URL('../benchmarks/pdf-baseline.mjs',import.meta.url));
console.log('Open benchmarks/render.html in the built source-folder extension. Both engines use the same synthetic fixture; no documents are uploaded.');
