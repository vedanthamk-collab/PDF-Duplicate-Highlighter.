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
 return /^(?:date|no|number|amount|total|details|of|to)$/i.test(value)?'':value;
}
function extract(text){
 const bill=/\b(tax invoice|invoice|(?:final |hospital |medical |pharmacy )?bill\s*(?:no\.?|number|#|:)|cash memo)\b/i.test(text);
 const receipt=!!field(text,'receipt')||/^\s*(?:payment\s+)?receipt\b/im.test(text)||(!bill&&/\b(payment received|amount received|received with thanks)\b/i.test(text));
 const documentType=receipt?'Receipt':bill?'Bill':'Other';
 const referenceNo=field(text,'(?:against\\s+)?(?:invoice|bill)')||field(text,'cash\\s+memo');
 const billNo=documentType==='Receipt'?(field(text,'receipt')||referenceNo):referenceNo;
 const dateMatch=text.match(/\b(?:(?:bill|invoice|receipt)\s+date|date)\s*[:.-]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3,9})[-/.]\d{2,4})\b/i);
 const billDate=dateMatch?.[1]||'';
 const currency=/\bUSD\b|\$/.test(text)?'USD':/\bEUR\b|€/.test(text)?'EUR':/\bGBP\b|£/.test(text)?'GBP':'INR';
 const labels=documentType==='Receipt'?['amount (?:received|paid)','paid amount','receipt amount','total amount','grand total']:['grand total','(?:total bill|invoice total|bill amount|net payable|amount payable|net amount|total amount)','(?<!sub[ -])\\btotal\\b'];
 let values=[];
 for(const label of labels){
  const matches=[...text.matchAll(new RegExp('(?:'+label+')\\s*[:=.-]?\\s*'+moneyPattern,'gi'))];
  values=[...new Set(matches.map(m=>moneyToCents(m[1])).filter(n=>n!==null))];
  if(values.length)break;
 }
 const amountCents=values.length===1?values[0]:null;
 const billType=/\b(pharmacy|pharma|medicines|medical store)\b/i.test(text)?'Pharmacy':/\b(laboratory|diagnostic|pathology|lab)\b/i.test(text)?'Diagnostics':/\b(hospital|inpatient|discharge)\b/i.test(text)?'Hospital':/\b(consultation|clinic)\b/i.test(text)?'Consultation':'Other';
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
  const text=sig.ocr||'',parsed=extract(text),source=provenance[index]||{fileName:'Document',sourceIndex:0,sourcePage:page};
  const previous=groups.at(-1),mark=parsed.pageMarker,priorMark=previous?.lastMarker;
  const continuation=previous&&mark&&priorMark&&mark.total===priorMark.total&&mark.page===priorMark.page+1&&mark.page<=mark.total&&source.sourceIndex===previous.source.sourceIndex&&source.sourcePage===previous.lastSourcePage+1&&parsed.billNo&&parsed.billNo===previous.parsed.billNo&&parsed.billDate&&parsed.billDate===previous.parsed.billDate&&parsed.documentType===previous.parsed.documentType;
  if(continuation){previous.pages.push(page);previous.text+='\n'+text;previous.parsed=extract(previous.text);previous.lastMarker=mark;previous.lastSourcePage=source.sourcePage;}
  else groups.push({pages:[page],text,parsed,source,lastMarker:mark,lastSourcePage:source.sourcePage});
 });
 const rows=groups.map(group=>{
  const {pageMarker,...parsed}=group.parsed;
  if(pageMarker&&group.pages.length!==pageMarker.total)parsed.issues.push('Incomplete multi-page document: check total');
  return {...parsed,id:'pages-'+group.pages.join('-'),pages:group.pages,fileName:group.source.fileName,remarks:'',included:parsed.documentType==='Bill'&&!parsed.issues.length,reviewed:false};
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
  receipt.included=false;
 }
 return rows;
}
export function summarizeBills(rows){
 let totalCents=0,included=0;const invalid=[];
 for(const row of rows){
  if(!row.included||row.documentType!=='Bill')continue;
  if(row.currency!=='INR'||!Number.isSafeInteger(row.amountCents)||row.amountCents<0){invalid.push(row.id);continue;}
  totalCents+=row.amountCents;included++;
 }
 if(!Number.isSafeInteger(totalCents))throw new Error('Total exceeds supported amount range.');
 return {totalCents,included,invalid,needsReview:rows.filter(r=>r.documentType!=='Other'&&!r.reviewed&&r.issues.length).length};
}
export function billTableData(rows){
 const data=[['Bill no.','Bill date','Bill type','Bill amount','Type','Remarks','Included in bill total','Source pages','Review issues']];
 for(const r of rows.filter(r=>r.documentType!=='Other'))data.push([r.billNo,r.billDate,r.billType,r.amountCents===null?'':r.currency+' '+formatMoney(r.amountCents),r.documentType,r.remarks,r.included&&r.documentType==='Bill'&&r.currency==='INR'&&Number.isSafeInteger(r.amountCents)?'Yes':'No',r.pages.join(', '),r.reviewed?'':r.issues.join('; ')]);
 const sum=summarizeBills(rows);data.push(['','','Draft bill total','INR '+formatMoney(sum.totalCents),'','Bills only','','','']);return data;
}
export function spreadsheetText(value){const text=String(value??'').replace(/[\t\r\n]+/g,' ');return /^[\s]*[=+@-]/.test(text)?"'"+text:text;}
export function tableToTsv(data){return data.map(row=>row.map(spreadsheetText).join('\t')).join('\n');}
export function tableToHtml(data){const escape=s=>spreadsheetText(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return '<table>'+data.map((row,i)=>'<tr>'+row.map(v=>'<'+(i?'td':'th')+'>'+escape(v)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>';}
