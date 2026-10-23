// Shared by the browser and regression tests. Input bytes are never mutated.
export async function createCleanPdf(PDFDocument, bytes, matches) {
 const pdf=await PDFDocument.load(bytes.slice(),{ignoreEncryption:false});
 const count=pdf.getPageCount();
 const pages=[...new Set(matches.map(match=>match.page))];
 for(const page of pages){
  if(!Number.isInteger(page)||page<=1||page>count)throw new Error('Invalid duplicate page: '+page);
 }
 if(pages.length>=count)throw new Error('Cannot remove every page');
 for(const page of pages.sort((a,b)=>b-a))pdf.removePage(page-1);
 return pdf.save({useObjectStreams:true});
}

// Explicit bill/receipt-page export. Selection never adds marks or changes source bytes.
export async function createSelectedPdf(PDFDocument,bytes,pageNumbers){
 const pdf=await PDFDocument.load(bytes.slice()),count=pdf.getPageCount(),keep=new Set(pageNumbers);
 if(!keep.size)throw new Error('No bill or receipt pages selected.');
 for(const page of keep)if(!Number.isInteger(page)||page<1||page>count)throw new Error('Invalid selected page: '+page);
 for(let page=count;page>=1;page--)if(!keep.has(page))pdf.removePage(page-1);
 return pdf.save({useObjectStreams:true});
}
