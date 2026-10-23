// Local-only PDF/image assembly, shared by the viewer and regression tests.
export function fileKind(name,bytes){
 if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46)return 'pdf';
 if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return 'png';
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'jpg';
 throw new Error(name+': unsupported or damaged file. Choose PDF, JPG or PNG.');
}
export async function mergeDocuments(PDFDocument,files,{progress=()=>{},normalizeImage}={}){
 if(!files.length)throw new Error('Choose at least one document.');
 const output=await PDFDocument.create(),provenance=[];
 for(let index=0;index<files.length;index++){
  const file=files[index];progress(index+1,files.length,file.name);
  try{
   const bytes=new Uint8Array(file.arrayBuffer?await file.arrayBuffer():file.bytes.slice());
   const kind=fileKind(file.name,bytes);
   if(kind==='pdf'){
    const source=await PDFDocument.load(bytes.slice());
    if(!source.getPageCount())throw new Error('PDF contains no pages.');
    const pages=await output.copyPages(source,source.getPageIndices());
    pages.forEach((page,i)=>{output.addPage(page);provenance.push({fileName:file.name,sourceIndex:index,sourcePage:i+1});});
   }else{
    // Browser callback corrects EXIF rotation where present; inputs are never mutated.
    const normalized=normalizeImage?await normalizeImage(bytes,kind):{bytes,kind};
    const image=await output[normalized.kind==='png'?'embedPng':'embedJpg'](normalized.bytes);
    const scale=Math.min(1,595.28/image.width,841.89/image.height);
    const page=output.addPage([image.width*scale,image.height*scale]);
    page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});
    provenance.push({fileName:file.name,sourceIndex:index,sourcePage:1});
   }
  }catch(error){throw new Error(file.name+': '+error.message);}
 }
 return {bytes:await output.save(),provenance};
}
// Only EXIF-oriented JPEGs need re-encoding. PNGs and ordinary JPEGs stay lossless.
export function jpegNeedsOrientation(bytes){
 if(bytes[0]!==255||bytes[1]!==216)return false;
 let offset=2;
 while(offset+4<bytes.length&&bytes[offset]===255){
  const marker=bytes[offset+1];if(marker===0xda||marker===0xd9)break;
  const length=(bytes[offset+2]<<8)|bytes[offset+3];if(length<2||offset+length+2>bytes.length)break;
  if(marker===0xe1&&String.fromCharCode(...bytes.slice(offset+4,offset+10))==='Exif\0\0')return true;
  offset+=length+2;
 }
 return false;
}
