const msg=document.getElementById('msg');
document.getElementById('open').onclick=async()=>{
 try{await chrome.tabs.create({url:chrome.runtime.getURL('viewer.html')});}
 catch(error){msg.textContent='Could not open viewer: '+error.message;}
};
document.getElementById('import').onclick=async()=>{
 try{
  const {openPdfTab}=await import('./pdf-source.js');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  await openPdfTab(chrome,tab?.url||'');
 }catch(error){msg.textContent=error.message;}
};
