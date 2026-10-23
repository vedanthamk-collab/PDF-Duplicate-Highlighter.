import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {initClaims} from '../claims-ui.js';
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes={};this.disabled=false;this.hidden=false;this.value='';this.textContent='';}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
 setAttribute(key,value){this.attributes[key]=value;}addEventListener(type,handler){this[type]=handler;}focus(){this.focused=true;}select(){this.selected=true;}
}
const bill='Central Pharmacy\nTax Invoice\nInvoice No: B-001\nDate: 23/10/2026\nGrand Total: INR 100.25';
test('claims UI queues/reorders files, edits totals, restores exclusions, copies whole table and resets safely',async()=>{
 const html=await readFile(new URL('../viewer.html',import.meta.url),'utf8');
 const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const previousDocument=globalThis.document,previousPDFLib=globalThis.PDFLib,navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let copied='',pagesExported,merged,cleared=0;
 const state={bytes:null,signatures:[],matches:[],provenance:[]};
 const clipboard={writeText:async text=>{copied=text;}};
 globalThis.document={getElementById:id=>elements[id]||null,createElement:tag=>new Element(tag)};globalThis.PDFLib={PDFDocument};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard}});
 try{
  const workspace=initClaims({getState:()=>state,onClear:()=>{cleared++;state.bytes=null;},onMerged:async(bytes,name,provenance)=>{merged={bytes,name,provenance};state.bytes=bytes;},showDocument:page=>{state.jumpedTo=page;},onBillsDownload:pages=>{pagesExported=pages;}});
  const pdf=await PDFDocument.create();pdf.addPage([300,400]);const bytes=await pdf.save();
  workspace.addFiles([{name:'a.pdf',bytes},{name:'b.pdf',bytes}]);assert.equal(elements.fileQueue.children.length,2);
  elements.fileQueue.children[1].children[1].onclick();
  await elements.mergeScan.onclick();assert.equal(merged.provenance[0].fileName,'b.pdf');assert.equal(merged.provenance[1].fileName,'a.pdf');assert.equal(elements.file.disabled,false);
  elements.clearQueue.onclick();assert.equal(elements.mergeScan.disabled,true);assert.equal(cleared,1);
  state.signatures=[{ocr:bill},{ocr:'Receipt No: R-01\nDate: 23/10/2026\nAgainst Bill No: B-001\nAmount Paid: 100.25'},{ocr:'Synthetic laboratory report glucose 99'}];
  state.scanComplete=true;workspace.syncLedger();assert.equal(elements.billRows.children.length,2,'every completed scan extracts bills without opening the tab');assert.equal(elements.billRows.children.length,2);assert.equal(elements.excludedRows.children.length,1);assert.equal(elements.billTotal.textContent,'Draft bill total: INR 100.25');
  let tr=elements.billRows.children[0];const amount=tr.children[5].children[0];amount.value='150.75';amount.oninput();assert.equal(elements.billTotal.textContent,'Draft bill total: INR 150.75');
  workspace.syncLedger();assert.equal(elements.billTotal.textContent,'Draft bill total: INR 150.75','edits survive reclassification');
  tr=elements.billRows.children[0];const include=tr.children[0].children[0];include.checked=false;include.onchange();assert.equal(elements.billTotal.textContent,'Draft bill total: INR 0.00');include.checked=true;include.onchange();
  assert.equal(elements.billRows.children[1].children[0].children[0].disabled,true,'receipt cannot be included in bill total');
  elements.exportBills.onclick();assert.deepEqual(pagesExported,[1,2]);
  elements.excludedRows.children[0].children[1].onclick();assert.equal(elements.billRows.children.length,3);assert.equal(elements.billCount.textContent,3);assert.equal(elements.billTotal.textContent,'Draft bill total: INR 150.75');
  await elements.copyBills.onclick();assert.ok(copied.includes('Bill no.\tBill date'));assert.ok(copied.includes('INR 150.75'));assert.equal(elements.copyStatus.textContent,'Table copied. Paste into Excel or Sheets.');
  state.billAIpending=2;workspace.syncLedger();assert.match(elements.billSummary.textContent,/AI still reading 2/);await elements.copyBills.onclick();assert.match(copied,/Provisional subtotal/);state.billAIpending=0;
  clipboard.writeText=async()=>{throw new Error('denied');};await elements.copyBills.onclick();assert.equal(elements.copyFallback.hidden,false);assert.equal(elements.copyFallback.selected,true);
  elements.billsTab.onclick();assert.equal(elements.stage.hidden,true);elements.documentsTab.onclick();assert.equal(elements.stage.hidden,false);
  workspace.resetLedger();assert.equal(elements.billRows.children.length,0);assert.equal(elements.billTotal.textContent,'Draft bill total: INR 0.00');
  state.scanComplete=false;elements.billsTab.onclick();assert.equal(elements.billRows.children.length,0,'bill tab cannot extract partial scan results');
  state.scanComplete=true;workspace.syncLedger();assert.equal(elements.billRows.children.length,2,'billing runs automatically once duplicate scan completes');
  state.matches=[{page:1,original:2}];workspace.syncLedger();assert.equal(elements.billRows.children.length,1,'billing follows confirmed duplicate exclusions');
  state.bytes=bytes;workspace.setBusy(false);assert.equal(elements.clearQueue.disabled,false,'clear remains available for a loaded document with an empty queue');
  state.matches=[];state.signatures[0].billingNeedsReview=true;workspace.syncLedger();assert.match(elements.billTotal.textContent,/Calculation incomplete/);assert.match(elements.billSummary.textContent,/uncertain OCR/);
  elements.clearQueue.onclick();assert.equal(cleared,2);assert.equal(elements.billRows.children.length,0);assert.equal(elements.stage.hidden,false);
 }finally{
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousPDFLib===undefined)delete globalThis.PDFLib;else globalThis.PDFLib=previousPDFLib;
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
 }
});
