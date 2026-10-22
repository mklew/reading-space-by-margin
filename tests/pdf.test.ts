import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {parsePdf} from '../src/server/pdf';

export function pdfFixture(text='Hello PDF reader') {
  const stream=`BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(source));source+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(source);
  source+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}
test('PDF extracts page text with exact DOM offsets and preserves source bytes',async()=>{
  const original=pdfFixture('Hello <PDF> & reader');const copy=Buffer.from(original);
  const result=await parsePdf(original,'Fixture.pdf');
  assert.equal(result.category,'pdf');assert.equal(result.title,'Fixture');
  assert.match(result.text,/Hello <PDF> & reader/);
  const dom=new JSDOM(result.html);assert.equal(dom.window.document.body.textContent,result.text);dom.window.close();
  assert.deepEqual(original,copy);
});
test('PDF rejects non-PDF and damaged files',async()=>{
  await assert.rejects(parsePdf(Buffer.from('not a PDF'),'bad.pdf'),/Choose a PDF/);
  await assert.rejects(parsePdf(Buffer.from('%PDF-1.4\ninvalid'),'bad.pdf'));
});
