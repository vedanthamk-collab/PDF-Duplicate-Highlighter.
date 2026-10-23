// Retry weak OCR for accounting only; duplicate matching retains its original text.
export async function recoverBillText(worker,initial,getImage,isCurrent=()=>true){
 if(!Number.isFinite(initial?.data?.confidence)||initial.data.confidence>=75)return initial;
 let best=initial;
  for(const angle of [0,Math.PI/2,-Math.PI/2,Math.PI]){
   if(!isCurrent())break;
   const image=await getImage(angle);
   let result;
   try{result=await worker.recognize(image);}finally{if(image){image.width=0;image.height=0;}}
   const words=value=>(value?.data?.text?.match(/\b(invoice|total|amount|date|bill|receipt|cash|credit|memo|name|hospital|laboratory|pharmacy|patient|report|normal|result|signature|qty|rate)\b/gi)||[]).length;
   const quality=value=>(value?.data?.confidence??0)+Math.min(40,words(value)*3);
   if(quality(result)>quality(best))best={...result,recoveryAngle:angle};
   if((best?.data?.confidence??0)>=85&&words(best)>=3)break;
  }
  return best;
}
