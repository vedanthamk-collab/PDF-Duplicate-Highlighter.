import {PDFDocument,StandardFonts} from 'pdf-lib';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[path.dirname(require.resolve('pdfjs-dist/package.json'))]}));
const directory=new URL('../tmp/claims-fixtures/',import.meta.url);await mkdir(directory,{recursive:true});
const details='Synthetic fixture only. No patient or personal information. Service completed and item quantities checked. Printed copy for testing local document processing, extraction and duplicate detection.';
async function pdf(name,lines,count=1){const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);for(let n=0;n<count;n++){const page=doc.addPage([600,800]);page.drawText(lines.concat(details).join('\n'),{x:35,y:740,size:14,font,maxWidth:530,lineHeight:25});}await writeFile(new URL(name,directory),await doc.save());}
await pdf('01-invoice.pdf',['Central Hospital','Tax Invoice','Invoice No: 12345678','Invoice Date: 23/10/2026','Grand Total: INR 1234.50'],2);
await pdf('02-receipt.pdf',['Payment Receipt','Receipt No: R-A01','Date: 23/10/2026','Against Invoice No: 12345678','Amount Paid: INR 1234.50']);
function picture(name,lines,mime){const canvas=createCanvas(1200,1400),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,1400);ctx.fillStyle='black';ctx.font='36px Arial';lines.forEach((line,i)=>ctx.fillText(line,70,120+i*70));return writeFile(new URL(name,directory),canvas.toBuffer(mime));}
await picture('03-pharmacy.jpg',['Central Pharmacy','Tax Invoice','Invoice No: INV-B02','Invoice Date: 23/10/2026','Medicines dispensed','Grand Total: INR 500.00','Synthetic document only','No personal information'],'image/jpeg');
await picture('04-report.png',['Laboratory report','Sample reference SYN-001','Date: 23/10/2026','Glucose result: 99','This is a report, not a bill.','Synthetic document only.'],'image/png');
console.log('Synthetic claims fixtures written to tmp/claims-fixtures/');
