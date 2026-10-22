import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { defaultPreferences, type Library } from '../src/domain';
import { exportArchive, feedsOpml, libraryCsv, parseImport } from '../src/server/transfer';
test('URL imports preserve saved time and progress alongside organization', async () => {
 const plan=await parseImport('reading.json',Buffer.from(JSON.stringify([{url:'https://example.com/a',title:'Saved reading',folder:'later',tags:['research'],progress:0.45,createdAt:'2023-01-31T19:48:28.686+00:00'}])));
 assert.deepEqual(plan.sources[0],{url:'https://example.com/a',title:'Saved reading',folder:'later',tags:['research'],progress:0.45,createdAt:'2023-01-31T19:48:28.686Z'});
 assert.equal(plan.warnings.length,0);
});
const library: Library = { documents: [{ id: 'one', favorite:true, title: '=SUM(1)', author: 'A', siteName: 'Example', url: 'https://example.com/a', html: '<p>Hello   world</p>', text: 'Hello   world', excerpt: 'Hello world', wordCount: 2, folder: 'archive', tags: ['garden'], note: 'My note', progress: .5, revision: 1, createdAt: '2026-01-01T00:00:00Z', movedAt: '2026-01-01T00:00:00Z' }], highlights: [{ id: 'h', documentId: 'one', start: 8, end: 13, quote: 'world', note: 'Highlight note', tags:['idea'], createdAt: '2026-01-01T00:00:00Z' }], feeds: [{ id: 'f', title: 'A & B', url: 'https://example.com/feed?a=1&b=2', checkedAt: null, error: null }], entries: [], preferences: defaultPreferences, preferencesRevision: 1 };
test('archive roundtrips content, whitespace offsets, annotations, tags and feed URLs without duplicate metadata files', async () => {
 const plan = await parseImport('archive.zip', await exportArchive(library));
 assert.equal(plan.documents.length, 1); assert.equal(plan.documents[0].favorite,true); assert.equal(plan.sources.length, 0);
 assert.equal(plan.documents[0].text, 'Hello   world'); assert.equal(plan.documents[0].highlights[0].note, 'Highlight note');
 assert.deepEqual(plan.documents[0].tags, ['garden']); assert.equal(plan.documents[0].folder, 'archive'); assert.equal(plan.documents[0].progress, .5);
 assert.equal(plan.feeds[0].url, library.feeds[0].url);
 assert.deepEqual(plan.documents[0].highlights[0].tags,['idea']);
});
test('OPML escapes XML and restores entities', async () => { const plan = await parseImport('feeds.opml', Buffer.from(feedsOpml(library))); assert.equal(plan.feeds[0].url, library.feeds[0].url); assert.equal(plan.feeds[0].title, 'A & B'); });
test('archive refuses a text-only library larger than its restore expansion limit', async () => {
 const text='a'.repeat(26*1024*1024);
 await assert.rejects(exportArchive({...library,documents:[{...library.documents[0],html:`<p>${text}</p>`,text}]}), /50 MB/);
});
test('CSV formula safety and quoted multiline metadata', async () => {
 assert.match(libraryCsv(library), /'=SUM/);
 const p = await parseImport('pocket.csv', Buffer.from('title,url,tags,status\n"A, title\nsecond line",https://example.com/a,"one,two",archived\nBad,javascript:alert(1),,\n'));
 assert.equal(p.sources.length, 1); assert.equal(p.sources[0].title, 'A, title\nsecond line'); assert.deepEqual(p.sources[0].tags, ['one', 'two']); assert.equal(p.sources[0].folder, 'archive'); assert.equal(p.warnings.length, 1);
});
test('sanitizes active markup and rejects stale highlight offsets', async () => {
 const p = await parseImport('data.json', Buffer.from(JSON.stringify({documents: [{html: '<p>Hello</p><script>bad()</script><img src="http://127.0.0.1/a" onerror="bad()">', highlights:[{start:5,end:10,quote:'bad()',note:''}]}]})));
 assert.equal(p.documents[0].text, 'Hello'); assert.doesNotMatch(p.documents[0].html, /script|127.0.0.1|onerror/); assert.equal(p.documents[0].highlights.length,0); assert.equal(p.warnings.length,1);
});
test('ZIP rejects traversal, false sizes, expansion bombs and oversized inputs', async () => {
 await assert.rejects(parseImport('bad.zip', Buffer.from(zipSync({'../bad.txt':Buffer.from('bad')}))), /Unsafe/);
 const zip = Buffer.from(zipSync({'bomb.txt':Buffer.alloc(51*1024*1024, 65)})); await assert.rejects(parseImport('bomb.zip',zip), /50 MB/);
 await assert.rejects(parseImport('huge.txt',Buffer.alloc(20*1024*1024+1)), /20 MB/);
 await assert.rejects(parseImport('bad.xml',Buffer.from('<!DOCTYPE opml><opml/>')), /unsafe/);
});
test('archive keeps valid files when individual entries are unsupported or malformed', async () => {
 const p = await parseImport('vendor.zip', Buffer.from(zipSync({'article.txt':Buffer.from('Readable words'), 'bad.json':Buffer.from('{'), 'attachment.pdf':Buffer.from('pdf')})));
 assert.equal(p.documents.length,1); assert.equal(p.warnings.length,2);
});
test('bookmark and Pocket JSON URL imports stay explicit sources', async () => {
 const p = await parseImport('bookmarks.html',Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="https://example.com/a" TAGS="one,two">Title</A></DL>'));
 assert.equal(p.documents.length,0); assert.deepEqual(p.sources[0].tags,['one','two']);
 const q = await parseImport('pocket.json',Buffer.from(JSON.stringify({list:{a:{resolved_url:'https://example.com/a',resolved_title:'Story',status:'1'}}})));
 assert.equal(q.sources[0].folder,'archive');
});

test('saved view exports preserve valid filters and explicitly report invalid ones',async()=>{
 const views=[{id:'view',name:'Quick reads',description:'',query:'minutes__lt:10',pinned:true,revision:3}];
 const plan=await parseImport('archive.zip',await exportArchive({...library,views}));
 assert.deepEqual(plan.views,[{...views[0],revision:0}]);
 const invalid=await parseImport('library.json',Buffer.from(JSON.stringify({...library,views:[{...views[0],query:'tag:('}]})));
 assert.equal(invalid.views?.length,0);
 assert.ok(invalid.warnings.some(w=>w.includes('invalid saved view')));
});

test('OPML folder round trip keeps grouped and unfiled subscriptions',async()=>{
 const grouped={...library,feeds:[{...library.feeds[0],folder:'Science & ideas'},{...library.feeds[0],id:'other',title:'Unfiled',url:'https://example.org/rss'}]};
 const plan=await parseImport('feeds.opml',Buffer.from(feedsOpml(grouped)));
 assert.equal(plan.feeds.length,2);
 assert.equal(plan.feeds.find(f=>f.url===library.feeds[0].url)?.folder,'Science & ideas');
 assert.equal(plan.feeds.find(f=>f.url==='https://example.org/rss')?.folder,'');
});

test('archive feed history maps source IDs to subscription URLs',async()=>{
 const entries=[{id:'entry',feedId:'f',url:'https://example.com/entry',title:'Entry',author:'',summary:'Summary',publishedAt:null,state:'dismissed' as const}];
 const plan=await parseImport('archive.zip',await exportArchive({...library,entries}));
 assert.equal(plan.entries?.[0].feedUrl,library.feeds[0].url);
 assert.equal(plan.entries?.[0].state,'dismissed');
});

test('Readwise CSV preserves folders, quoted tags, dates and fractional progress', async () => {
 const cells = ['Title','URL','Document tags','Saved date','Reading progress','Location'];
 const row = ['Reading','https://example.com/story',`['goals', 'strategy, work', "reader’s notes"]`,'2023-01-31 19:48:28.686000+00:00','0.45','archive'];
 const data = [cells,row].map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n');
 const plan = await parseImport('export.csv',Buffer.from(data));
 assert.deepEqual(plan.warnings,[]);
 assert.deepEqual(plan.sources[0],{url:'https://example.com/story',title:'Reading',tags:['goals','strategy, work','reader’s notes'],folder:'archive',progress:0.45,createdAt:'2023-01-31T19:48:28.686Z'});
});
