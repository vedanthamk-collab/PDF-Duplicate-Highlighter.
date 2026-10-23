// Conservative, deterministic extraction. OCR text is evidence to review, not an accounting authority.
export function moneyToCents(value){
 const text=String(value??'').trim().replace(/^(?:INR|RS\.?|₹|USD|EUR|GBP|\$|€|£)\s*/i,'').replace(/\s*(?:INR|RS\.?|₹|USD|EUR|GBP|only|\/-)\.?$/i,'').trim();
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(text))return null;
 const [whole,fraction='']=text.replaceAll(',','').split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(cents)&&cents>=0?cents:null;
}
export function formatMoney(cents){return cents===null||!Number.isSafeInteger(cents)?'':(cents/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
const moneyPattern='(?:INR|Rs\\.?|₹|USD|EUR|GBP|\\$|€|£)?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)(?![\\w.,]|/(?!-)|[ \\t]+\\d)';
function field(text,label){
 const match=text.match(new RegExp('\\b(?:'+label+')\\s*(?:(?:no\\.?|number|#)\\s*[:#.-]?|:)\\s*([A-Z0-9][A-Z0-9/._-]*)','i'));
 const value=match?.[1]||'';
 return /^(?:date|no|number|amount|total|details|of|to)(?:$|_)/i.test(value)?'':value;
}
function extract(text){
 // Export footers name source files, not the document printed on the page.
 text=text.replace(/^.*\.pdf\s*(?:-\s*Page\b.*|\([^\n]*\))\s*$/gim,'');
 const nonBill=/\b(?:claim form|guidance for filling|details of bills enclosed|claim documents submitted|bank account verification)\b/i.test(text);
 const financialLayout=(/\bnet amount\b/i.test(text)&&/\b(?:GSTIN|CGST|SGST|Qty|admission|room\s*rent)\b/i.test(text))||(/\btotal\s*[:=]?\s*(?:Rs\.?\s*)?\d/i.test(text)&&/\bconcessions\b/i.test(text)&&/\bpaid\b/i.test(text));
 const bill=!nonBill&&(/\b(tax invoice|invoice|cash bill|(?:final |hospital |medical |pharmacy )?bill\s*(?:no\.?|number|#|:)|cash\s*(?:\/\s*credit\s*)?memo)\b/i.test(text)||financialLayout||/\bb\s*\.\s*no\s*\./i.test(text));
 const receipt=!!field(text,'receipt')||/^\s*(?:(?:payment|OPD|cash)\s+)?receipt\b/im.test(text)||(!bill&&/\b(payment received|amount received|received with thanks)\b/i.test(text));
 const documentType=nonBill?'Other':receipt?'Receipt':bill?'Bill':'Other';
 const referenceNo=field(text,'(?:against\\s+)?(?:invoice|bill)')||field(text,'cash\\s+memo');
 const rawNo=bill?text.match(/^[ \t]*(?:b[ \t]*\.[ \t]*)?no\.?[ \t]*[:#.-]?[ \t]*([A-Z0-9][A-Z0-9/._-]*)/im)?.[1]||'':'';
 const standaloneNo=/^(?:date|amount|total)(?:$|_)/i.test(rawNo)?'':rawNo;
 const billNo=documentType==='Receipt'?(field(text,'receipt')||referenceNo):(referenceNo||standaloneNo);
 const dateMatch=text.match(/\b(?:(?:bill|invoice|receipt)\s+date|date)\s*[:.-]*\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3,9})[-/.]\d{2,4})\b/i);
 const billDate=dateMatch?.[1]||'';
 const indianCurrency=/\b(?:INR|Rupees|Rs\.?|GSTIN|CGST|SGST)\b|₹/i.test(text);
 const currency=/\bUSD\b/.test(text)||(!indianCurrency&&/\$\s*\d/.test(text))?'USD':/\bEUR\b|€/.test(text)?'EUR':/\bGBP\b|£/.test(text)?'GBP':'INR';
 const labels=documentType==='Receipt'?['amount (?:received|paid)','paid amount','receipt amount','total amount','grand total','(?<!sub[ -])\\btotal\\b']:['grand total','(?:total bill|invoice total|bill amount|net payable|amount payable|net amount|total amount)','(?<!sub[ -])\\btotal\\b'];
 let values=[];
 for(const label of labels){
  const matches=[...text.matchAll(new RegExp('(?:'+label+')\\s*[:=.|)\\]-]*\\s*'+moneyPattern,'gi'))];
  values=[...new Set(matches.map(m=>moneyToCents(m[1])).filter(n=>n!==null))];
  if(values.length)break;
 }
 const amountCents=values.length===1?values[0]:null;
 const billType=/\b(pharmacy|pharma|medicines|medical store)\b/i.test(text)||(/\bGSTIN\b/i.test(text)&&/\bMRP\b/i.test(text)&&/\b(?:batch|expiry)\b/i.test(text))?'Pharmacy':/\b(laboratory|diagnostic|pathology|lab)\b/i.test(text)?'Diagnostics':/\b(hospital|nursing\s*home|inpatient|discharge)\b/i.test(text)?'Hospital':/\b(consultation|clinic)\b/i.test(text)?'Consultation':'Other';
 const pageMarker=text.match(/\bpage\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
 const issues=[];
 if(documentType==='Other')issues.push('Not identified as a bill or receipt');
 if(!billNo&&documentType!=='Other')issues.push('Missing document number');
 if(!billDate&&documentType!=='Other')issues.push('Missing date');
 if(/\b(?:credit note|refund|cancelled|canceled|pro[ -]?forma|estimate)\b/i.test(text))issues.push('Credit, cancelled or provisional document: review expense');
 if(amountCents===null)issues.push(values.length>1?'Conflicting totals':'No clear total');
 if(currency!=='INR')issues.push('Non-INR amount: excluded from INR total');
 const numbers=[...text.matchAll(/\b(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/._-]*)/gi)].map(m=>m[1].toLowerCase());
 if(new Set(numbers).size>1)issues.push('Multiple bill numbers: split into separate rows');
 return {billNo,referenceNo,billDate,billType,amountCents,currency,documentType,issues,pageMarker:pageMarker?{page:Number(pageMarker[1]),total:Number(pageMarker[2])}:null};
}
export function buildBillLedger(signatures,provenance=[],matches=[]){
 const duplicates=new Set(matches.map(m=>m.page)),groups=[];
 signatures.forEach((sig,index)=>{
  const page=index+1;if(duplicates.has(page))return;
  const text=sig.billingOcr||sig.ocr||'',fallback=extract(text),parsed=sig.vision?{...sig.vision,billType:fallback.billType!=='Other'?fallback.billType:sig.vision.billType,issues:[...sig.vision.issues]}:fallback,source=provenance[index]||{fileName:'Document',sourceIndex:0,sourcePage:page};
  if(sig.billingNeedsReview&&!sig.vision)parsed.issues.push('OCR uncertain: verify fields');
  const previous=groups.at(-1),mark=parsed.pageMarker,priorMark=previous?.lastMarker;
  const continuation=previous&&mark&&priorMark&&mark.total===priorMark.total&&mark.page===priorMark.page+1&&mark.page<=mark.total&&source.sourceIndex===previous.source.sourceIndex&&source.sourcePage===previous.lastSourcePage+1&&parsed.billNo&&parsed.billNo===previous.parsed.billNo&&parsed.billDate&&parsed.billDate===previous.parsed.billDate&&parsed.documentType===previous.parsed.documentType;
  if(continuation){previous.pages.push(page);previous.text+='\n'+text;previous.parsed=extract(previous.text);previous.lastMarker=mark;previous.lastSourcePage=source.sourcePage;}
  else groups.push({pages:[page],text,parsed,source,lastMarker:mark,lastSourcePage:source.sourcePage});
 });
 const rows=groups.map(group=>{
  const {pageMarker,...parsed}=group.parsed;
  if(pageMarker&&group.pages.length!==pageMarker.total)parsed.issues.push('Incomplete multi-page document: check total');
  return {...parsed,id:'pages-'+group.pages.join('-'),pages:group.pages,fileName:group.source.fileName,remarks:parsed.remarks||'',included:parsed.documentType==='Bill'&&!parsed.issues.length,reviewed:false};
 });
 // Same number is a review signal, never proof that two expenses should be merged.
 const keys=new Map();
 for(const row of rows.filter(r=>r.documentType==='Bill'&&r.billNo)){
  const key=row.billNo.toLowerCase();if(!keys.has(key))keys.set(key,[]);keys.get(key).push(row);
 }
 for(const group of keys.values())if(group.length>1)for(const row of group){row.issues.push('Repeated bill number: check for overlap');row.included=false;}
 for(const receipt of rows.filter(r=>r.documentType==='Receipt')){
  const bills=rows.filter(b=>b.documentType==='Bill'&&receipt.referenceNo&&b.billNo.toLowerCase()===receipt.referenceNo.toLowerCase()&&b.currency===receipt.currency);
  if(bills.length===1){receipt.linkedBillId=bills[0].id;receipt.remarks='Paid against '+bills[0].billNo;}
  else receipt.remarks='Unmatched receipt';
  receipt.included=!!(receipt.localAI&&receipt.serviceReceipt&&!receipt.linkedBillId&&!receipt.issues.length);
 }
 for(const row of rows)if(row.localAI&&row.documentType!=='Other')row.issues.push(...(row.advisories||[]),'AI extraction: verify source');
 return rows;
}
export function countsAsExpense(row){return row.documentType==='Bill'||(row.documentType==='Receipt'&&(row.reviewed||(row.localAI&&row.serviceReceipt))&&!row.linkedBillId);}
export function summarizeBills(rows){
 let totalCents=0,included=0;const invalid=[];
 for(const row of rows){
  if(!row.included||!countsAsExpense(row))continue;
  if(row.currency!=='INR'||!Number.isSafeInteger(row.amountCents)||row.amountCents<0){invalid.push(row.id);continue;}
  totalCents+=row.amountCents;included++;
 }
 if(!Number.isSafeInteger(totalCents))throw new Error('Total exceeds supported amount range.');
 return {totalCents,included,invalid,needsReview:rows.filter(r=>r.documentType!=='Other'&&!r.reviewed&&r.issues.length).length};
}
export function billTableData(rows){
 const data=[['Bill no.','Bill date','Bill type','Bill amount','Type','Remarks','Included in bill total','Source pages','Review issues']];
 for(const r of rows.filter(r=>r.documentType!=='Other'))data.push([r.billNo,r.billDate,r.billType,r.amountCents===null?'':r.currency+' '+formatMoney(r.amountCents),r.documentType,r.remarks,r.included&&countsAsExpense(r)&&r.currency==='INR'&&Number.isSafeInteger(r.amountCents)?'Yes':'No',r.pages.join(', '),r.reviewed?'':r.issues.join('; ')]);
 const sum=summarizeBills(rows),incomplete=sum.needsReview>0||rows.some(r=>r.issues.some(i=>i.startsWith('OCR uncertain'))||(r.documentType!=='Other'&&r.amountCents===null));
 data.push(['','',incomplete?'Included bill subtotal':'Draft bill total','INR '+formatMoney(sum.totalCents),'','Draft expenses; linked payments excluded','','',incomplete?'Calculation incomplete: review unread fields':'']);return data;
}
export function spreadsheetText(value){const text=String(value??'').replace(/[\t\r\n]+/g,' ');return /^[\s]*[=+@-]/.test(text)?"'"+text:text;}
export function tableToTsv(data){return data.map(row=>row.map(spreadsheetText).join('\t')).join('\n');}
export function tableToHtml(data){const escape=s=>spreadsheetText(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return '<table>'+data.map((row,i)=>'<tr>'+row.map(v=>'<'+(i?'td':'th')+'>'+escape(v)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>';}
