import {mergeDocuments,jpegNeedsOrientation} from './documents.js';
import {buildBillLedger,summarizeBills,moneyToCents,formatMoney,billTableData,tableToTsv,tableToHtml} from './billing.js';
const $=id=>document.getElementById(id);
export function initClaims({getState,onMerged,showDocument,onBillsDownload,onClear}){
 const files=[],edits=new Map();let rows=[],manual=[],busy=false,tab='documents',revision=0;
 function setTab(value){tab=value;$('workspaceMain').className=value==='bills'?'billing-mode':'';$('stage').hidden=value!=='documents';$('billView').hidden=value!=='bills';$('documentsTab').setAttribute('aria-selected',String(value==='documents'));$('billsTab').setAttribute('aria-selected',String(value==='bills'));}
 $('documentsTab').onclick=()=>setTab('documents');$('billsTab').onclick=()=>setTab('bills');
 function queue(){
  $('fileQueue').replaceChildren();$('queueCount').textContent=files.length+' file'+(files.length===1?'':'s');
  files.forEach((file,index)=>{
   const item=document.createElement('li'),name=document.createElement('span');name.textContent=file.name;name.title=file.name;item.append(name);
   for(const [label,delta] of [['↑',-1],['↓',1],['×',0]]){
    const b=document.createElement('button');b.type='button';b.className='queue-action';b.textContent=label;b.setAttribute('aria-label',(delta<0?'Move up ':delta>0?'Move down ':'Remove ')+file.name);b.disabled=busy||(delta!==0&&(index+delta<0||index+delta>=files.length));
    b.onclick=()=>{if(delta)[files[index],files[index+delta]]=[files[index+delta],files[index]];else files.splice(index,1);queue();};item.append(b);
   }
   $('fileQueue').append(item);
  });
  $('mergeScan').disabled=busy||!files.length;$('clearQueue').disabled=busy||(!files.length&&!getState().bytes);$('file').disabled=busy;
 }
 function addFiles(selected){if(busy)return;files.push(...Array.from(selected));setTab('documents');queue();$('uploadQueue').open=true;}
 $('clearQueue').onclick=()=>{if(busy)return;files.length=0;resetLedger();queue();onClear();};
 for(const target of [$('stage'),$('billView')]){
  target.addEventListener('dragover',e=>{e.preventDefault();});
  target.addEventListener('drop',e=>{e.preventDefault();addFiles(e.dataTransfer.files);});
 }
 async function normalizeImage(bytes,kind){
  if(kind!=='jpg'||!jpegNeedsOrientation(bytes))return {bytes,kind};
  const image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}),{imageOrientation:'from-image'});
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  try{canvas.getContext('2d').drawImage(image,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not normalize image orientation');return {bytes:new Uint8Array(await blob.arrayBuffer()),kind:'png'};}
  finally{image.close();canvas.width=0;canvas.height=0;}
 }
 $('mergeScan').onclick=async()=>{
  if(busy||!files.length)return;setBusy(true);$('progress').textContent='Combining documents…';
  try{
   const result=await mergeDocuments(globalThis.PDFLib.PDFDocument,files,{normalizeImage,progress:(i,total,name)=>{$('progress').textContent='Combining '+i+'/'+total+': '+name;}});
   await onMerged(result.bytes,files.length===1?files[0].name.replace(/\.(jpg|jpeg|png)$/i,'.pdf'):'combined-claims.pdf',result.provenance);
  }catch(error){$('progress').textContent='Could not combine documents: '+error.message+'. No partial PDF was loaded.';}
  finally{setBusy(false);}
 };
 function setBusy(value){busy=value;queue();$('addBill').disabled=value;$('copyBills').disabled=value||!rows.some(r=>r.documentType!=='Other');$('exportBills').disabled=value||!rows.some(r=>r.documentType!=='Other'&&r.pages.length);$('exportAll').disabled=value||!getState().bytes;$('rescan').disabled=value||!getState().pdf;$('export').disabled=value||!getState().scanComplete;}
 function jump(row){if(!row.pages.length)return;setTab('documents');showDocument(row.pages[0]);}
 function save(row,field,value){row[field]=value;edits.set(row.id,{...(edits.get(row.id)||{}),[field]:value});revision++;summary();}
 function summary(){
  const sum=summarizeBills(rows);
  $('billTotal').textContent='Draft bill total: INR '+formatMoney(sum.totalCents);
  $('billSummary').textContent=sum.included+' bills included · '+sum.needsReview+' need review'+(sum.invalid.length?' · '+sum.invalid.length+' invalid amounts excluded':'')+' · '+rows.filter(r=>r.documentType==='Other').length+' documents excluded. Receipts are not added.';
  $('copyBills').disabled=busy||!rows.some(r=>r.documentType!=='Other');$('exportBills').disabled=busy||!rows.some(r=>r.documentType!=='Other'&&r.pages.length);
  // A copied table must never be described as current after edits.
  $('copyStatus').textContent='';$('copyFallback').hidden=true;
 }
 function cell(tr){const td=document.createElement('td');tr.append(td);return td;}
 function input(tr,row,field,label,value){const el=document.createElement('input');el.value=value??'';el.setAttribute('aria-label',label+' '+(row.pages.length?'page '+row.pages.join(', '):'manual row'));el.oninput=()=>save(row,field,el.value);cell(tr).append(el);return el;}
 function select(tr,row,field,label,options){const el=document.createElement('select');el.setAttribute('aria-label',label+' '+row.id);for(const value of options){const op=document.createElement('option');op.value=value;op.textContent=value;el.append(op);}el.value=row[field];el.onchange=()=>{save(row,field,el.value);if(field==='documentType'&&el.value!=='Bill')save(row,'included',false);render();};cell(tr).append(el);return el;}
 function render(){
  $('billCount').textContent=rows.filter(r=>r.documentType!=='Other').length;
  $('billRows').replaceChildren();$('excludedRows').replaceChildren();
  for(const row of rows){
   if(row.documentType==='Other'){
    const item=document.createElement('div');item.className='excluded-item';const link=document.createElement('button');link.className='secondary';link.textContent=row.fileName+' · page '+row.pages.join(', ');link.onclick=()=>jump(row);
    const restore=document.createElement('button');restore.textContent='Review as bill';restore.onclick=()=>{save(row,'documentType','Bill');save(row,'included',false);render();};item.append(link,restore);$('excludedRows').append(item);continue;
   }
   const tr=document.createElement('tr');
   const include=document.createElement('input');include.type='checkbox';include.checked=row.included&&row.documentType==='Bill';include.disabled=row.documentType!=='Bill';include.setAttribute('aria-label','Include '+row.id+' in bill total');include.onchange=()=>save(row,'included',include.checked);cell(tr).append(include);
   const source=document.createElement('button');source.className='source-link';source.textContent=row.pages.length?'p. '+row.pages.join(', '):'Manual';source.title=row.fileName;source.onclick=()=>jump(row);cell(tr).append(source);
   input(tr,row,'billNo','Bill number',row.billNo);input(tr,row,'billDate','Bill date',row.billDate);
   input(tr,row,'billType','Bill type',row.billType).setAttribute('list','billCategories');
   const amount=input(tr,row,'amountCents','Bill amount',row.amountCents===null?'':(row.amountCents/100).toFixed(2));amount.inputMode='decimal';amount.oninput=()=>{const value=moneyToCents(amount.value);amount.setAttribute('aria-invalid',String(value===null));save(row,'amountCents',value);};
   select(tr,row,'currency','Currency',['INR','USD','EUR','GBP']);select(tr,row,'documentType','Document type',['Bill','Receipt','Other']);
   const remark=input(tr,row,'remarks','Remarks',row.remarks);remark.className='remarks-input';
   const review=cell(tr),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=row.reviewed;checkbox.setAttribute('aria-label','Reviewed '+row.id);const note=document.createElement('small');note.textContent=row.reviewed?'Reviewed':row.issues.join('; ')||'Check extracted fields';checkbox.onchange=()=>{save(row,'reviewed',checkbox.checked);note.textContent=checkbox.checked?'Reviewed':row.issues.join('; ')||'Check extracted fields';};review.append(checkbox,note);
   $('billRows').append(tr);
  }
  const excluded=rows.filter(r=>r.documentType==='Other').length;$('excludedCount').textContent='Excluded documents ('+excluded+')';
  $('billEmpty').hidden=rows.some(r=>r.documentType!=='Other');summary();
 }
 function syncLedger(){
  const s=getState();if(!s.scanComplete)return;
  rows=buildBillLedger(s.signatures,s.provenance,s.matches).map(row=>({...row,...(edits.get(row.id)||{})})).concat(manual);
  $('billCount').textContent=rows.filter(r=>r.documentType!=='Other').length;revision++;render();
 }
 function resetLedger(){edits.clear();manual=[];rows=[];revision++;render();setTab('documents');}
 $('exportBills').onclick=()=>onBillsDownload(rows.filter(r=>r.documentType!=='Other').flatMap(r=>r.pages));
 $('addBill').onclick=()=>{const row={id:'manual-'+crypto.randomUUID(),pages:[],fileName:'Manual entry',billNo:'',referenceNo:'',billDate:'',billType:'Other',amountCents:null,currency:'INR',documentType:'Bill',remarks:'',included:false,reviewed:false,issues:['Manual entry: check amount and inclusion']};manual.push(row);rows.push(row);render();};
 $('copyBills').onclick=async()=>{
  const copiedRevision=revision,data=billTableData(rows),text=tableToTsv(data);
  try{
   if(typeof ClipboardItem!=='undefined'&&navigator.clipboard.write)await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([tableToHtml(data)],{type:'text/html'})})]);
   else await navigator.clipboard.writeText(text);
   $('copyStatus').textContent=copiedRevision===revision?'Table copied. Paste into Excel or Sheets.':'Table changed during copying; copy again.';
  }catch(error){$('copyFallback').value=text;$('copyFallback').hidden=false;$('copyFallback').focus();$('copyFallback').select();$('copyStatus').textContent='Clipboard unavailable. Copy the selected table text with Ctrl+C.';}
 };
 queue();render();return {addFiles,setBusy,syncLedger,resetLedger};
}
