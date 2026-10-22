// Classic startup script: it can report a failed module import before handlers exist.
(async function startViewer(){
 const progress=document.getElementById('progress');
 const file=document.getElementById('file');
 file.disabled=true;
 progress.textContent='Starting PDF viewer…';
 try{
  await import('./viewer.js');
  file.disabled=false;
  if(progress.textContent==='Starting PDF viewer…')progress.textContent='Ready. Choose a PDF to begin.';
 }catch(error){
  document.getElementById('stats').textContent='Viewer could not start';
  progress.textContent='PDF libraries could not load. In chrome://extensions, remove this installation and use Load unpacked to select the built dist folder (not the source folder). Then open a new viewer tab. Details: '+error.message;
  console.error('Viewer startup failed',error);
 }
})();
