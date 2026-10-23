import {buildBillLedger} from './billing.js';
export function needsBillReading(sig){
 if(sig.vision)return false;
 const text=sig.billingOcr||sig.ocr||'';
 const financial=/\b(invoice|bill|receipt|memo|payable|net amount|GSTIN|concessions)\b/i.test(text);
 const form=/\b(claim form|details of bills enclosed|bank account verification|discharge summary|operative notes|guidance for filling)\b/i.test(text);
 const report=!financial&&/\b(impression|reference range|normal ranges?|study reveals|government of india|aadhaar|income tax department)\b/i.test(text);
 if(form||report)return false;
 const [row]=buildBillLedger([sig]);
 return !(!sig.billingNeedsReview&&row.documentType!=='Other'&&!row.issues.length);
}
export function planBillReading(signatures,matches=[]){const duplicates=new Set(matches.map(m=>m.page));return signatures.map((sig,index)=>({sig,index})).filter(({sig,index})=>!duplicates.has(index+1)&&needsBillReading(sig)).map(({index})=>index);}
