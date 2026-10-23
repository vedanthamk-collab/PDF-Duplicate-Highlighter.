import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyToCents,buildBillLedger,summarizeBills,billTableData,tableToTsv,tableToHtml} from '../billing.js';

test('remarks stay concise and copied review issues remain separate',()=>{
 const rows=buildBillLedger([{ocr:'Receipt No: R-1\nAgainst Bill No: B-1\nAmount Paid: 100'}]);
 assert.equal(rows[0].remarks,'Unmatched receipt');
 const data=billTableData(rows);
 assert.equal(data[1][5],'Unmatched receipt');
 assert.equal(data[0][8],'Review issues');assert.match(data[1][8],/Missing date/);
 assert.equal(summarizeBills(rows).totalCents,0);
});
const bill=(extra='',no='INV-001')=>'Central Pharmacy\nTax Invoice\nInvoice No: '+no+'\nInvoice Date: 23/10/2026\nGrand Total: INR 1,250.50\n'+extra;
const sig=text=>({ocr:text});

test('claim checklist is not a bill and its cancelled cheque is not an expense warning',()=>{
 const [row]=buildBillLedger([sig('CLAIM FORM\nDETAILS OF BILLS ENCLOSED\nHospital Main Bill\nPharmacy Bill\nBill No Date Amount\nCancelled blank cheque\nClaim_form.pdf - Page 2/3')]);
 assert.equal(row.documentType,'Other');assert.equal(row.included,false);
});
test('standalone invoice number and repeated date punctuation are supported without rounding',()=>{
 const [row]=buildBillLedger([sig('Example Medical\nINVOICE\nNo. 81\nDate :: 16/06/2026\nNet Amount: 1320.57')]);
 assert.equal(row.billNo,'81');assert.equal(row.billDate,'16/06/2026');assert.equal(row.amountCents,132057);assert.equal(row.included,true);
});
test('billing recovery is separate from matching text and uncertain OCR cannot auto-add expenses',()=>{
 const original='unreadable sideways page';
 const signature={ocr:original,billingOcr:'INVOICE\nNo. 88\nDate: 16/06/2026\nTotal: 473',billingNeedsReview:true};
 const [row]=buildBillLedger([signature]);assert.equal(row.billNo,'88');assert.equal(row.amountCents,47300);assert.equal(row.included,false);assert.match(row.issues.join(' '),/OCR uncertain/);assert.equal(signature.ocr,original);
});
test('copied total is explicitly incomplete when a bill amount cannot be read',()=>{
 const rows=buildBillLedger([sig('INVOICE\nNo. 81\nDate: 16/06/2026\nTOTAL illegible')]);
 const total=billTableData(rows).at(-1);assert.equal(total[2],'Included bill subtotal');assert.match(total[8],/incomplete/);
});
test('cash credit memo is recognized while stray OCR dollar does not change an INR invoice currency',()=>{
 const [row]=buildBillLedger([sig('Cash/Credit Memo\nB.No. 81\nDate: 16/06/2026\nTotal | 2100/-\nCGST 0 SGST 0\nOCR noise $8')]);
 assert.equal(row.documentType,'Bill');assert.equal(row.billNo,'81');assert.equal(row.currency,'INR');assert.equal(row.amountCents,210000);
});
test('standalone service receipt requires explicit inclusion and review; linked payment never counts twice',()=>{
 const rows=buildBillLedger([sig('OPD RECEIPT\nReceipt No: SERVICE-1\nDate: 16/06/2026\nTotal: 7000')]);
 assert.equal(summarizeBills(rows).totalCents,0);rows[0].included=true;assert.equal(summarizeBills(rows).totalCents,0);
 rows[0].reviewed=true;assert.equal(summarizeBills(rows).totalCents,700000);
 rows[0].linkedBillId='separate-invoice';assert.equal(summarizeBills(rows).totalCents,0);
});
test('money uses integer paise and validates Indian/Western grouping without guessing',()=>{
 for(const [text,value] of [['1,250.50',125050],['1,23,456.78',12345678],['Rs. 100/-',10000],['0.01',1],['42',4200]])assert.equal(moneyToCents(text),value,text);
 for(const text of ['',null,'1O0','1,2,3','-1','1.234','NaN','Infinity','=1+1'])assert.equal(moneyToCents(text),null,String(text));
});
test('extracts invoice fields and includes a complete INR bill',()=>{
 const [row]=buildBillLedger([sig(bill())]);
 assert.equal(row.billNo,'INV-001');assert.equal(row.billDate,'23/10/2026');assert.equal(row.billType,'Pharmacy');assert.equal(row.amountCents,125050);assert.equal(row.documentType,'Bill');assert.equal(row.included,true);assert.equal(summarizeBills([row]).totalCents,125050);
});
test('linked and unmatched receipts never double the bill expense',()=>{
 const rows=buildBillLedger([sig(bill()),sig('Payment Receipt\nReceipt No: R-201\nDate: 23/10/2026\nAgainst Invoice No: INV-001\nAmount Paid: Rs. 1,250.50'),sig('Receipt No: R-202\nDate: 23/10/2026\nAmount Received: 500')]);
 assert.equal(rows[1].documentType,'Receipt');assert.equal(rows[1].linkedBillId,rows[0].id);assert.equal(summarizeBills(rows).totalCents,125050);
 rows[1].included=true;assert.equal(summarizeBills(rows).totalCents,125050);
 assert.match(rows[2].remarks,/Unmatched/);
});
test('excludes non-bills and missing/ambiguous amounts without treating them as zero',()=>{
 const rows=buildBillLedger([sig('Laboratory report patient 12345678 glucose 99 date 23/10/2026'),sig('Invoice No: X1\nDate: 23/10/2026\nSubtotal: 100'),sig('Invoice No: X2\nDate: 23/10/2026\nGrand Total: 100\nGrand Total: 200')]);
 assert.equal(rows[0].documentType,'Other');assert.equal(rows[1].amountCents,null);assert.equal(rows[2].amountCents,null);assert.equal(rows.every(r=>!r.included),true);
});
test('keeps labeled grand total instead of summing line items, subtotal and tax',()=>{
 const [row]=buildBillLedger([sig(bill('Subtotal: 1000\nTax: 250.50\nTotal amount: 1250.50'))]);assert.equal(row.amountCents,125050);
});
test('exact duplicate pages are omitted from the ledger',()=>{
 const rows=buildBillLedger([sig(bill()),sig(bill())],[],[{page:2,original:1}]);assert.equal(rows.length,1);assert.equal(summarizeBills(rows).totalCents,125050);
});
test('shared bill number alone never merges bills or silently adds both',()=>{
 const rows=buildBillLedger([sig(bill()),sig(bill().replace('1,250.50','2,500.00'))]);assert.equal(rows.length,2);assert.equal(rows.every(r=>!r.included&&r.issues.some(i=>i.includes('Repeated'))),true);
});
test('multi-page bill combines only explicit sequential pages of same source, id and date',()=>{
 const first=bill('Page 1 of 2').replace('Grand Total: INR 1,250.50','Items 250');
 const rows=buildBillLedger([sig(first),sig(bill('Page 2 of 2'))],[{fileName:'a.pdf',sourceIndex:0,sourcePage:1},{fileName:'a.pdf',sourceIndex:0,sourcePage:2}]);
 assert.equal(rows.length,1);assert.deepEqual(rows[0].pages,[1,2]);assert.equal(rows[0].included,true);assert.equal(summarizeBills(rows).totalCents,125050);
 const split=buildBillLedger([sig(first),sig(bill('Page 2 of 2'))],[{fileName:'a.pdf',sourceIndex:0,sourcePage:1},{fileName:'b.pdf',sourceIndex:1,sourcePage:1}]);assert.equal(split.length,2);assert.equal(split.every(r=>!r.included),true);
});
test('missing continuation and multiple bill numbers require review',()=>{
 const [partial]=buildBillLedger([sig(bill('Page 1 of 3'))]);assert.equal(partial.included,false);
 const [multiple]=buildBillLedger([sig(bill('Invoice No: OTHER-002'))]);assert.equal(multiple.included,false);assert.ok(multiple.issues.some(i=>i.includes('Multiple')));
});
test('foreign currency and invalid edits are excluded from INR total',()=>{
 const rows=buildBillLedger([sig(bill().replace('INR','USD'))]);assert.equal(rows[0].included,false);rows[0].included=true;assert.deepEqual(summarizeBills(rows).invalid,[rows[0].id]);
 rows[0].currency='INR';rows[0].amountCents=null;assert.equal(summarizeBills(rows).totalCents,0);
});
test('editable exclusion and zero bill amount recalculate correctly in paise',()=>{
 const rows=buildBillLedger([sig(bill('', 'A1')),sig(bill('', 'B2'))]);rows[1].amountCents=1;assert.equal(summarizeBills(rows).totalCents,125051);rows[0].included=false;assert.equal(summarizeBills(rows).totalCents,1);rows[1].amountCents=0;assert.equal(summarizeBills(rows).included,1);
});
test('whole-table export retains columns and total, escapes HTML and spreadsheet formulas',()=>{
 const [row]=buildBillLedger([sig(bill())]);row.remarks='=HYPERLINK("bad")\n<script>';row.billNo='<invoice>';
 const data=billTableData([row]);assert.equal(data[0][0],'Bill no.');assert.equal(data.at(-1)[3],'INR 1,250.50');
 const tsv=tableToTsv(data);assert.ok(tsv.includes("'=HYPERLINK"));assert.equal(tsv.split('\n').length,3);
 const html=tableToHtml(data);assert.ok(html.includes('&lt;invoice&gt;'));assert.ok(!html.includes('<script>'));
});

test('OCR letters inside amounts and space-separated numbers are not silently truncated',()=>{
 for(const amount of ['1O00','1250.567','1 250','10/20']){
  const [row]=buildBillLedger([sig(bill().replace('1,250.50',amount))]);assert.equal(row.amountCents,null,amount);assert.equal(row.included,false);
 }
});
test('cancelled, credit and provisional documents are not automatically included',()=>{
 for(const note of ['Credit note','Refund','Cancelled','Pro forma','Estimate'])assert.equal(buildBillLedger([sig(bill(note))])[0].included,false);
});

test('receipt wording in an invoice footer does not hide a bill expense',()=>{
 const [row]=buildBillLedger([sig(bill('Please retain this receipt for your records.'))]);assert.equal(row.documentType,'Bill');assert.equal(row.included,true);
});
