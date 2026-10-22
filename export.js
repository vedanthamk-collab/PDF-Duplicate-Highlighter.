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
