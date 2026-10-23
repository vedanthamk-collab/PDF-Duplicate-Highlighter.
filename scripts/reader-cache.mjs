import {createHash} from 'node:crypto';
export function createReaderCache(limit=32){
 const entries=new Map();
 return {async read(image,read,signal){
  signal?.throwIfAborted();
  const key=createHash('sha256').update(image).digest('hex');
  if(entries.has(key)){const value=entries.get(key);entries.delete(key);entries.set(key,value);return {result:structuredClone(value),cacheHit:true};}
  const value=await read();signal?.throwIfAborted();entries.set(key,structuredClone(value));
  if(entries.size>limit)entries.delete(entries.keys().next().value);
  return {result:value,cacheHit:false};
 }};
}
