import test from 'node:test';
import assert from 'node:assert/strict';
import {findDuplicates} from '../matcher.js';

const body='Central diagnostic laboratory patient details specimen collected report approved doctor investigation haematology biochemistry analysis reference interval result units verified final copy department service';
const page=(extra='')=>({ocr:body+' '+extra,rotations:[{w:20,h:20,gray:new Uint8Array(400),dark:new Uint8Array(400).fill(1)}]});
test('later copies refer to the earliest original',()=>{
 const p=page('invoice number 12345678 total 120');
 assert.deepEqual(findDuplicates([p,p,p]).map(({page,original})=>[page,original]),[[2,1],[3,1]]);
});
test('same patient and template with changed single-digit result stays original',()=>{
 assert.equal(findDuplicates([page('patient id 12345678 glucose 4'),page('patient id 12345678 glucose 9')]).length,0);
});
test('same invoice with changed amount stays original',()=>{
 assert.equal(findDuplicates([page('invoice number 12345678 total 120'),page('invoice number 12345678 total 121')]).length,0);
});
test('same CRP result with different report date stays original',()=>{
 assert.equal(findDuplicates([page('crp 4 mg date 2026/10/20'),page('crp 4 mg date 2026/10/21')]).length,0);
});
test('conflicting identifiers cannot match',()=>{
 assert.equal(findDuplicates([page('invoice number 12345678'),page('invoice number 12345679')]).length,0);
});
test('short and blank text never match solely on layout',()=>{
 assert.equal(findDuplicates([{...page(),ocr:''},{...page(),ocr:''}]).length,0);
});
test('manual rejection keeps the page and subsequent matches retain earliest original',()=>{
 const p=page('invoice number 12345678 total 120');
 assert.deepEqual(findDuplicates([p,p,p],new Map([[2,{type:'reject'}]])).map(({page,original})=>[page,original]),[[3,1]]);
});
test('generic identical content requires visual agreement',()=>{
 const p=page('report date 2026/10/20 result 5');
 assert.equal(findDuplicates([p,p]).length,1);
 const other={...p,rotations:[{...p.rotations[0],dark:new Uint8Array(400)}]};
 assert.equal(findDuplicates([p,other]).length,0);
});
