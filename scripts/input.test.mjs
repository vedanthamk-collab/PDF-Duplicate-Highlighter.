import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {pdfSource,openPdfTab} from '../pdf-source.js';

test('direct online and local PDF tabs retain encoded paths and query parameters',()=>{
 for(const url of ['https://example.org/report.pdf?token=synthetic','file:///C:/Reports/test%20document.pdf'])assert.equal(pdfSource(url),url);
});
test('Chrome PDF viewer wrapper resolves underlying file',()=>{
 assert.equal(pdfSource('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file='+encodeURIComponent('file:///C:/test.pdf')),'file:///C:/test.pdf');
});
test('unsupported tabs give a saved-file fallback',()=>{
 for(const url of ['chrome://newtab/','blob:https://example.org/123','chrome-extension://other/viewer.html'])assert.throws(()=>pdfSource(url),/Download the PDF/);
});
test('local tab import checks file access before opening viewer',async()=>{
 const opened=[];let allowed=false;
 const api={extension:{isAllowedFileSchemeAccess:async()=>allowed},runtime:{getURL:path=>'chrome-extension://test/'+path},tabs:{create:async info=>opened.push(info)}};
 await assert.rejects(openPdfTab(api,'file:///C:/test.pdf'),/Allow access to file URLs/);
 assert.equal(opened.length,0);allowed=true;
 await openPdfTab(api,'file:///C:/test.pdf');
 assert.equal(new URL(opened[0].url).searchParams.get('source'),'file:///C:/test.pdf');
 await openPdfTab(api,'https://example.org/test.pdf');assert.equal(opened.length,2);
});
test('startup failure disables disconnected picker and shows installation recovery',async()=>{
 const elements={file:{},progress:{},stats:{}};
 const context=vm.createContext({document:{getElementById:id=>elements[id]},console:{error(){}}});
 await new vm.Script(await readFile(new URL('../startup.js',import.meta.url),'utf8')).runInContext(context);
 assert.equal(elements.file.disabled,true);
 assert.equal(elements.stats.textContent,'Viewer could not start');
 assert.match(elements.progress.textContent,/built dist folder/);
});
