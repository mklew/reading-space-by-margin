import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {createStore} from '../src/server/store';
import {exportArchive,parseImport,unzip} from '../src/server/transfer';

test('archive restores original bytes and document linkage into a different library',async()=>{
  const store=createStore({memory:true});
  try {
    const bytes=Buffer.from('synthetic original bytes');
    const file=await store.saveAttachment('source','book.epub','application/epub+zip',bytes);
    const doc=await store.saveDocument('source',{title:'Book',author:'',siteName:'EPUB',url:'',html:'<p>Book text</p>',text:'Book text',excerpt:'Book text',wordCount:2,category:'epub',attachmentId:file.id});
    const library=await store.getLibrary('source');
    const archive=await exportArchive(library,[{...file,bytes}]);
    const plan=await parseImport('backup.zip',archive);
    assert.equal(plan.attachments?.length,1);assert.equal(plan.documents[0].attachmentId,file.id);assert.deepEqual(plan.warnings,[]);
    for(const original of plan.attachments??[])await store.saveAttachment('restored',original.name,original.mime,original.bytes);
    await store.importSnapshots('restored',plan);
    const restored=(await store.getLibrary('restored')).documents[0];
    assert.equal(restored.id,doc.id);assert.equal(restored.attachmentId,file.id);
    assert.deepEqual(Buffer.from((await store.getAttachment('restored',restored.attachmentId!)).bytes),bytes);
    const entries=Object.fromEntries(unzip(archive).map(entry=>[entry.name,entry.bytes]));
    entries[`originals/${file.id}`]=Buffer.from('corrupted');
    await assert.rejects(parseImport('corrupted.zip',Buffer.from(zipSync(entries))),/corrupted/);
    const withoutOriginals=await parseImport('snapshot.json',Buffer.from(JSON.stringify({...library,format:'margin',version:1})));
    assert.equal(withoutOriginals.documents[0].attachmentId,undefined);assert.match(withoutOriginals.warnings.join(' '),/original attachment/);
    assert.equal(file.id,createHash('sha256').update(bytes).digest('hex'));
  } finally {await store.close();}
});

test('illustrated EPUB links and highlight offsets survive backup restore',async()=>{
  const {epubFixture}=await import('./fixtures/epub');
  const {parseEpub}=await import('../src/server/epub');
  const {JSDOM}=await import('jsdom');
  const store=createStore({memory:true});
  try {
    const bytes=epubFixture();
    const original=await store.saveAttachment('source','illustrated.epub','application/epub+zip',bytes);
    const article=parseEpub(bytes);
    const doc=await store.saveDocument('source',{...article,attachmentId:original.id});
    const library=await store.getLibrary('source');
    library.highlights.push({id:'fixture-highlight',documentId:doc.id,start:0,end:5,quote:doc.text.slice(0,5),note:'Keep this passage',createdAt:new Date().toISOString()});
    const plan=await parseImport('backup.zip',await exportArchive(library,[{...original,bytes}]));
    const restored=plan.documents[0];
    assert.equal(restored.text,doc.text);
    assert.equal(restored.highlights[0].quote,doc.text.slice(0,5));
    const sourceDOM=new JSDOM(article.html),restoredDOM=new JSDOM(restored.html);
    try {
      assert.equal(restoredDOM.window.document.querySelector('img')?.getAttribute('src'),sourceDOM.window.document.querySelector('img')?.getAttribute('src'));
      for(const link of restoredDOM.window.document.querySelectorAll('a[href^="#epub-"]')) {
        assert.ok(restoredDOM.window.document.querySelector(link.getAttribute('href')!));
      }
      assert.ok(restoredDOM.window.document.querySelector('a[href^="#epub-"]'));
    } finally {sourceDOM.window.close();restoredDOM.window.close();}
    const standalone=await parseImport('library.json',Buffer.from(JSON.stringify(library)));
    assert.doesNotMatch(standalone.documents[0].html,/\/api\/files\//);
    assert.equal(standalone.documents[0].text,doc.text);
    const hostile=await parseImport('library.json',Buffer.from(JSON.stringify({documents:[{...doc,html:'<p id="outside">Text</p><img src="/api/files/other/resources/key"><a href="javascript:alert(1)">Bad</a>'}]})));
    assert.doesNotMatch(hostile.documents[0].html,/outside|javascript|\/api\/files\//);
  } finally {await store.close();}
});
