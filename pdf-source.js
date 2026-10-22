export function pdfSource(raw){
 const url=new URL(raw);
 if(['http:','https:','file:'].includes(url.protocol))return url.href;
 if(url.protocol==='chrome-extension:'&&url.hostname==='mhjfbmdgcfjbbpaeojofohoefgiehjai'){
  const nested=url.searchParams.get('file')||url.searchParams.get('src');
  if(nested)return pdfSource(nested);
 }
 throw new Error('This tab does not expose a direct PDF link. Download the PDF and choose the saved file in the viewer.');
}
export async function openPdfTab(api,raw){
 const source=pdfSource(raw);
 if(source.startsWith('file:')&&!await api.extension.isAllowedFileSchemeAccess()){
  throw new Error('For local PDF tabs, enable Allow access to file URLs in this extension’s Details at chrome://extensions. You can also open the viewer and choose the saved PDF without enabling that setting.');
 }
 return api.tabs.create({url:api.runtime.getURL('viewer.html')+'?source='+encodeURIComponent(source)});
}
