function compareImages(a,b){
 if(a.w!==b.w||a.h!==b.h)return 0;
 const n=a.gray.length;
 // Whole-page light similarity alone is unsafe for sparse reports. Compare printed foreground overlap.
 let overlap=0,union=0,changes=0,fgDiff=0,filledA=0,filledB=0;
 for(let i=0;i<n;i++){
  const x=a.dark[i],y=b.dark[i];if(x)filledA++;if(y)filledB++;
  if(x&&y)overlap++;if(x||y){union++;fgDiff+=Math.abs(a.gray[i]-b.gray[i]);}
  if(x!==y)changes++;
 }
 if(union<180||Math.min(filledA,filledB)/Math.max(filledA,filledB||1)<.7)return 0;
 const iou=overlap/union,balanced=2*overlap/(filledA+filledB);
 const agreement=1-changes/union;
 return Math.min(iou,balanced,agreement);
}
function compareText(a,b){
 if(!a||!b)return null;
 const fa=new Map(),fb=new Map();
 for(const t of a)fa.set(t,(fa.get(t)||0)+1);
 for(const t of b)fb.set(t,(fb.get(t)||0)+1);
 let intersection=0,totalA=0,totalB=0;
 for(const v of fa.values())totalA+=v;
 for(const v of fb.values())totalB+=v;
 for(const [k,v] of fa)intersection+=Math.min(v,fb.get(k)||0);
 return (2*intersection)/(totalA+totalB);
}
function similarity(a,b){
 const ta=compareText(a.text,b.text);
 let visual=0;
 // Rotate only one scan relative to the other; full 0/90/180/270° candidates.
 for(const r of b.rotations){const value=compareImages(a.rotations[0],r);if(value>visual)visual=value;}
 return {visual,semantic:ta};
}
function fingerprint(text){
 const raw=(text||'').toLowerCase().replace(/[^a-z0-9./\s-]/g,' ');
 const words=(raw.match(/[a-z]{2,}|\d+(?:[./-]\d+)*/g)||[]);
 const counts=new Map(),numbers=new Map();
 for(const word of words){counts.set(word,(counts.get(word)||0)+1);if(/\d/.test(word))numbers.set(word,(numbers.get(word)||0)+1);}
 return {words,counts,numbers};
}
function overlap(a,b){
 let common=0,na=0,nb=0;
 for(const v of a.values())na+=v;for(const v of b.values())nb+=v;
 for(const [k,v] of a)common+=Math.min(v,b.get(k)||0);
 return na+nb?2*common/(na+nb):0;
}
function extractedIds(raw){
 const cleaned=(raw||'').toLowerCase().replace(/\s+/g,' ');
 const out={};
 for(const [kind,re] of [
  ['invoice',/(?:invoice|bill)\s*(?:no|number|#|:|\.){0,8}\s*[:.#-]?\s*([0-9-]{8,})/],
  ['patient',/(?:patient\s*id|lab\s*no)\s*[:.#-]?\s*([0-9-]{8,})/]
 ]){const match=cleaned.match(re);if(match)out[kind]=match[1].replace(/-/g,'');}
 return out;
}
function identityConflict(a,b){
 const x=extractedIds(a.ocr),y=extractedIds(b.ocr);
 for(const key of ['invoice','patient']){
  if(x[key]&&y[key]&&x[key]!==y[key])return true;
 }
 return false;
}
function clinicalValue(text){
 const raw=(text||'').toLowerCase().replace(/\s+/g,' ');
 // Explicit value attached to named investigation. Shared lab form headings aren't enough.
 const match=raw.match(/\bcrp\b\s*[:=-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mg|\/|mgl|$)/)
  ||raw.match(/\bcrp\b\s*[:=-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)(?=\s)/);
 return match?['crp',match[1].replace(',','.')]:null;
}
export function findDuplicates(signatures, overrides=new Map()){
 const state={signatures,overrides};
 state.matches=[];state.possible=[];const originals=[];
 const fingerprints=state.signatures.map(sig=>fingerprint(sig.ocr||''));
 for(let i=0;i<state.signatures.length;i++){
  const current=state.signatures[i],currentText=fingerprints[i];
  const currentIds=extractedIds(current.ocr||'');let best=null;
  for(const j of originals){
   const ref=state.signatures[j],ids=extractedIds(ref.ocr||'');
   if(identityConflict(current,ref))continue;
   const source=fingerprints[j];
   if(currentText.words.length<24||source.words.length<24)continue;
   const word=overlap(currentText.counts,source.counts);
   const nums=overlap(currentText.numbers,source.numbers);
   const sameInvoice=!!(currentIds.invoice&&ids.invoice&&currentIds.invoice===ids.invoice);
   const samePatient=!!(currentIds.patient&&ids.patient&&currentIds.patient===ids.patient);
   const sameType=/(ha?ematology|biochemistry|serology|crp|cbc)/i.test(current.ocr)&&
       /(ha?ematology|biochemistry|serology|crp|cbc)/i.test(ref.ocr);
   const valueA=clinicalValue(current.ocr),valueB=clinicalValue(ref.ocr);
   const clinicalEqual=!!(valueA&&valueB&&valueA[0]===valueB[0]&&valueA[1]===valueB[1]);
   const clinicalConflict=!!(valueA&&valueB&&valueA[0]===valueB[0]&&valueA[1]!==valueB[1]);
   if(clinicalConflict)continue;
   // Matching invoice numbers have more evidentiary weight than shared layouts.
   const invoiceMatch=sameInvoice&&word>=.965&&nums===1;
   const medicalMatch=samePatient&&sameType&&word>=.965&&nums===1;
   const clinicalMatch=clinicalEqual&&word>=.965&&nums===1;
   const genericMatch=!sameInvoice&&!samePatient&&!clinicalEqual&&word>=.965&&nums===1&&similarity(current,ref).visual>=.90;
   if(!(invoiceMatch||medicalMatch||clinicalMatch||genericMatch))continue;
   const score=word*.5+nums*.5;
   if(!best||score>best.score)best={original:j+1,score};
  }
  const override=state.overrides.get(i+1);
  if(override?.type==='confirm'){state.matches.push({page:i+1,original:override.original,manual:true});continue;}
  if(override?.type==='reject'){originals.push(i);continue;}
  if(best){state.matches.push({page:i+1,original:best.original,score:best.score});continue;}
  originals.push(i);
 }
 return state.matches;
}
