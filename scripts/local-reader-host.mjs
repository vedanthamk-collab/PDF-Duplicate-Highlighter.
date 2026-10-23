// Chrome Native Messaging host. All image inference stays on this computer.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {VISION_SCHEMA,VISION_PROMPT} from '../local-vision.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),folder=path.join(root,'tmp/local-vision');
let server,ready,endpoint,key,buffer=Buffer.alloc(0),queue=Promise.resolve();const jobs=new Map();
function reply(value){const data=Buffer.from(JSON.stringify(value));const header=Buffer.alloc(4);header.writeUInt32LE(data.length);process.stdout.write(Buffer.concat([header,data]));}
async function start(){
 if(ready)return ready;
 ready=(async()=>{
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  key=randomBytes(32).toString('hex');endpoint='http://127.0.0.1:'+port;
  server=spawn(path.join(folder,'runtime/llama-server.exe'),['-m',path.join(folder,'model.gguf'),'--mmproj',path.join(folder,'vision.gguf'),'--host','127.0.0.1','--port',String(port),'--api-key',key,'--no-webui','-c','4096','--image-max-tokens','1024','-t','4','-ngl','0','--parallel','1'],{windowsHide:true,stdio:'ignore'});
  let failed;server.on('error',e=>{failed=e;});server.on('exit',()=>{failed=Error('Local model stopped');});
  for(let n=0;n<120;n++){if(failed)throw failed;try{const r=await fetch(endpoint+'/health',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  throw Error('Local model did not start. Run scripts/setup-local-reader.ps1.');
 })();return ready;
}
async function handle(message){
 const controller=jobs.get(message.id);if(!controller||controller.signal.aborted)return;
 try{
  if(message.type==='hello'){reply({id:message.id,result:{available:true}});return;}
  if(message.type!=='read'||typeof message.image!=='string'||message.image.length>10000000||!/^[A-Za-z0-9+/=]+$/.test(message.image))throw Error('Invalid page image');
  await start();controller.signal.throwIfAborted();
  const response=await fetch(endpoint+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},signal:controller.signal,body:JSON.stringify({model:'local',temperature:0,max_tokens:650,response_format:{type:'json_schema',json_schema:{name:'bill',strict:true,schema:VISION_SCHEMA}},messages:[{role:'system',content:VISION_PROMPT},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+message.image}},{type:'text',text:'Extract the document fields. Return JSON only.'}]}]})});
  if(!response.ok)throw Error('Local model request failed ('+response.status+')');
  const output=await response.json();reply({id:message.id,result:JSON.parse(output.choices[0].message.content)});
 }catch(error){reply({id:message.id,error:error.name==='AbortError'?'Cancelled':error.message});}finally{jobs.delete(message.id);}
}
process.stdin.on('data',chunk=>{
 buffer=Buffer.concat([buffer,chunk]);
 while(buffer.length>=4){const size=buffer.readUInt32LE(0);if(size>12000000){process.exitCode=1;process.stdin.destroy();return;}if(buffer.length<size+4)return;
  let message;try{message=JSON.parse(buffer.subarray(4,size+4));}catch{process.stdin.destroy();return;}buffer=buffer.subarray(size+4);
  if(!message||!Number.isSafeInteger(message.id)||message.id<1){process.stdin.destroy();return;}
  if(message.type==='cancel'){jobs.get(message.id)?.abort();continue;}
  jobs.set(message.id,new AbortController());queue=queue.then(()=>handle(message));
 }
});
function stop(){for(const job of jobs.values())job.abort();server?.kill();}
process.stdin.on('end',()=>{stop();process.exit();});process.on('exit',stop);process.on('SIGTERM',()=>{stop();process.exit();});
