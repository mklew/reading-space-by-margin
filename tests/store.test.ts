import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, type Article } from '../src/server/store';
const article:Article={title:'Example',author:'Author',siteName:'Example',url:'https://example.com/story',html:'<p>Hello reader.</p>',text:'Hello reader.',excerpt:'Hello reader.',wordCount:2};
const status=(code:number)=>(error:unknown)=>Boolean(error && typeof error==='object' && 'status' in error && error.status===code);

test('captures deduplicate, isolate owners, reject stale writes and preserve progress',async()=>{
  const store=createStore({memory:true});
  try {
    const [a,b]=await Promise.all([store.saveDocument('alice',article),store.saveDocument('alice',{...article,title:'Changed'})]);
    assert.equal(a.id,b.id);
    assert.equal((await store.getLibrary('alice')).documents.length,1);
    assert.equal((await store.getLibrary('bob')).documents.length,0);
    await assert.rejects(store.updateDocument('bob',a.id,{revision:0,note:'intrusion'}),status(404));
    const updated=await store.updateDocument('alice',a.id,{revision:0,note:'My note',tags:['test','test'],progress:0.75});
    assert.equal(updated.revision,1);
    assert.deepEqual(updated.tags,['test']);
    await assert.rejects(store.updateDocument('alice',a.id,{revision:0,note:'Stale'}),status(409));
    const lower=await store.updateDocument('alice',a.id,{revision:1,progress:0.2});
    assert.equal(lower.progress,0.75);
    const race=await Promise.allSettled([store.updateDocument('alice',a.id,{revision:2,note:'One'}),store.updateDocument('alice',a.id,{revision:2,note:'Two'})]);
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
    await store.saveDocument('alice',{...article,url:''});
    await store.saveDocument('alice',{...article,url:''});
    assert.equal((await store.getLibrary('alice')).documents.length,3);
    const highlight={id:'highlight',documentId:a.id,start:0,end:5,quote:'Hello',note:'First'};
    await store.addHighlight('alice',highlight);
    await store.addHighlight('alice',highlight);
    assert.equal((await store.getLibrary('alice')).highlights.length,1);
    await assert.rejects(store.addHighlight('bob',highlight),status(404));
    await assert.rejects(store.addHighlight('alice',{...highlight,id:'bad',quote:'Other'}),status(400));
    await assert.rejects(store.updateHighlight('bob','highlight','intrusion',undefined,0),status(404));
    await store.updateHighlight('alice','highlight','Updated',undefined,0);
    assert.equal((await store.getLibrary('alice')).highlights[0].note,'Updated');
    await assert.rejects(store.updateHighlight('alice','highlight','Stale note',['stale'],0),status(409));
    await assert.rejects(store.removeHighlight('alice','highlight',0),status(409));
    assert.equal((await store.getLibrary('alice')).highlights[0].note,'Updated');
    await store.removeHighlight('alice','highlight',1);
    assert.equal((await store.getLibrary('alice')).highlights.length,0);
    const prefs=(await store.getLibrary('alice')).preferences;
    await store.setPreferences('alice',{...prefs,theme:'dark'},0);
    await assert.rejects(store.setPreferences('alice',prefs,0),status(409));
  } finally {await store.close();}
});

test('feeds deduplicate and preserve lifecycle across refreshes',async()=>{
  const store=createStore({memory:true});
  try {
    const feed=await store.subscribeFeed('alice',{title:'News',url:'https://example.com/feed'});
    assert.equal((await store.subscribeFeed('alice',{title:'Again',url:feed.url})).id,feed.id);
    const parsed={entries:[{externalId:'one',title:'First',url:'https://example.com/one'}]};
    await store.ingestFeed('alice',feed.id,parsed);
    const entry=(await store.getLibrary('alice')).entries[0];
    await store.setEntryState('alice',entry.id,'dismissed');
    await store.ingestFeed('alice',feed.id,parsed);
    const library=await store.getLibrary('alice');
    assert.equal(library.entries.length,1);
    assert.equal(library.entries[0].state,'dismissed');
    const refreshed={entries:[{...parsed.entries[0],title:'Updated title',youtubeVideoId:'abcdefghijk',summary:'Video description'}]};
    await store.ingestFeed('alice',feed.id,refreshed);
    const updated=(await store.getLibrary('alice')).entries[0];
    assert.equal(updated.id,entry.id);
    assert.equal(updated.state,'dismissed');
    assert.equal(updated.title,'Updated title');
    assert.equal(updated.youtubeVideoId,'abcdefghijk');
    await store.setEntryState('alice',entry.id,'saved');
    await store.ingestFeed('alice',feed.id,{entries:[{...refreshed.entries[0],externalId:'changed-guid'}]});
    const saved=(await store.getLibrary('alice')).entries;
    assert.equal(saved.length,1);
    assert.equal(saved[0].id,entry.id);
    assert.equal(saved[0].state,'saved');
    await assert.rejects(store.ingestFeed('bob',feed.id,parsed),status(404));
    await assert.rejects(store.setEntryState('bob',entry.id,'saved'),status(404));
    await store.unsubscribeFeed('bob',feed.id);
    assert.equal((await store.getLibrary('alice')).feeds.length,1);
    await store.unsubscribeFeed('alice',feed.id);
    assert.equal((await store.getLibrary('alice')).entries.length,0);
  } finally {await store.close();}
});

test('account setup, scoped tokens, logout and persisted login limits survive restart',async(t)=>{
  const path=await mkdtemp(join(tmpdir(),'reader-store-'));
  const oldSecret=process.env.SETUP_SECRET;
  process.env.SETUP_SECRET='test-setup-secret';
  let store=createStore({path});
  try {
    assert.equal(await store.hasAccount(),false);
    await assert.rejects(store.createAccount('alice','a very long password','wrong'),status(401));
    const user=await store.createAccount('alice','a very long password','test-setup-secret');
    assert.equal(await store.hasAccount(),true);
    await assert.rejects(store.createAccount('bob','a very long password','test-setup-secret'),status(409));
    const session=await store.login('ALICE','a very long password');
    assert.equal(await store.authenticate(session,'session'),user);
    assert.equal(await store.authenticate(session,'capture'),null);
    const capture=await store.createCaptureToken(user);
    assert.equal(await store.authenticate(capture,'session'),null);
    assert.equal(await store.authenticate(capture,'capture'),user);
    await store.revokeCaptureTokens(user);
    assert.equal(await store.authenticate(capture,'capture'),null);
    await store.logout(session);
    assert.equal(await store.authenticate(session,'session'),null);
    const expiring=await store.login('alice','a very long password');
    const now=Date.now();
    const clock=t.mock.method(Date,'now',()=>now+31*86400000);
    assert.equal(await store.authenticate(expiring,'session'),null);
    clock.mock.restore();
    await store.saveDocument(user,article);
    for(let i=0;i<8;i++) await assert.rejects(store.login('alice','wrong'),status(401));
    await store.close();
    store=createStore({path});
    assert.equal((await store.getLibrary(user)).documents[0].title,'Example');
    assert.equal(await store.hasAccount(),true);
    await assert.rejects(store.login('alice','a very long password'),status(429));
  } finally {
    await store.close(); await rm(path,{recursive:true,force:true});
    if(oldSecret===undefined) delete process.env.SETUP_SECRET;else process.env.SETUP_SECRET=oldSecret;
  }
});

test('snapshot imports restore annotations atomically and retries preserve existing edits',async()=>{
  const store=createStore({memory:true});
  const plan={documents:[{...article,originalId:'original',folder:'archive' as const,tags:['saved'],note:'imported',progress:0.6,highlights:[{start:0,end:5,quote:'Hello',note:'annotation'}]}],feeds:[{title:'Feed',url:'https://example.com/feed'}],sources:[],warnings:[]};
  try {
    const result=await store.importSnapshots('alice',plan);
    assert.equal(result.documents,1);assert.equal(result.highlights,1);assert.equal(result.feeds,1);
    await store.updateDocument('alice','original',{revision:0,note:'new edit'});
    const retry=await store.importSnapshots('alice',plan);
    assert.equal(retry.duplicates,2);
    const library=await store.getLibrary('alice');
    assert.equal(library.documents[0].note,'new edit');
    assert.equal(library.documents[0].folder,'archive');
    assert.equal(library.highlights[0].documentId,'original');
    assert.equal((await store.getLibrary('bob')).documents.length,0);
    await assert.rejects(store.importSnapshots('alice',{...plan,documents:[{...plan.documents[0],originalId:'bad',url:'',highlights:[{start:0,end:5,quote:'wrong',note:''}]}]}),/does not match/);
    assert.equal((await store.getLibrary('alice')).documents.length,1);
  } finally {await store.close();}
});

test('saved views validate queries, isolate owners and protect concurrent edits',async()=>{
  const store=createStore({memory:true});
  try {
    const input={name:'Quick reads',description:'Short inbox articles',query:'in:inbox AND minutes__lt:10',pinned:true};
    const view=await store.saveView('alice',input);
    assert.equal((await store.getLibrary('alice')).views?.[0].query,input.query);
    assert.equal((await store.getLibrary('bob')).views?.length??0,0);
    await assert.rejects(store.saveView('alice',{...input,query:'tag:('}),/./);
    await store.saveView('alice',{...input,id:view.id,revision:0,pinned:false});
    await assert.rejects(store.removeView('alice',view.id,0),status(409));
    await assert.rejects(store.removeView('bob',view.id,1),status(404));
    await store.removeView('alice',view.id,1);
    assert.deepEqual((await store.getLibrary('alice')).views,[]);
  } finally {await store.close();}
});

test('bulk triage is atomic on stale revisions and preserves existing tags',async()=>{
 const store=createStore({memory:true});
 try {
  const a=await store.saveDocument('alice',article),b=await store.saveDocument('alice',{...article,url:'https://example.com/other'});
  await store.updateDocument('alice',b.id,{revision:0,tags:['existing']});
  await assert.rejects(store.bulkDocuments('alice',[{id:a.id,revision:0},{id:b.id,revision:0}],{folder:'archive'}),status(409));
  assert.equal((await store.getLibrary('alice')).documents.find(d=>d.id===a.id)?.folder,'inbox');
  await store.bulkDocuments('alice',[{id:a.id,revision:0},{id:b.id,revision:1}],{folder:'later',addTags:['new']});
  const data=await store.getLibrary('alice');
  assert.ok(data.documents.every(d=>d.folder==='later'));
  assert.deepEqual(data.documents.find(d=>d.id===b.id)?.tags,['existing','new']);
  await assert.rejects(store.bulkDocuments('bob',[{id:a.id,revision:1}],{folder:'trash'}),status(404));
 } finally {await store.close();}
});

test('metadata edits preserve article snapshots and highlight anchors',async()=>{
 const store=createStore({memory:true});
 try {
  const doc=await store.saveDocument('alice',article);
  await store.addHighlight('alice',{id:'anchor',documentId:doc.id,start:0,end:5,quote:'Hello',note:''});
  await store.updateDocument('alice',doc.id,{revision:0,title:'New title',author:'New author',siteName:'New source',excerpt:'Edited summary'});
  const data=await store.getLibrary('alice');
  assert.equal(data.documents[0].title,'New title');assert.equal(data.documents[0].text,article.text);assert.equal(data.documents[0].html,article.html);
  assert.equal(data.highlights[0].quote,'Hello');
  await store.updateHighlight('alice','anchor','Tagged note',['idea','idea'],0);
  assert.deepEqual((await store.getLibrary('alice')).highlights[0].tags,['idea']);
  await assert.rejects(store.updateDocument('alice',doc.id,{revision:1,title:' '}),/Invalid document metadata/);
 } finally {await store.close();}
});

test('explicit progress reset invalidates delayed writes from the previous reading position',async()=>{
 const store=createStore({memory:true});
 try {
  const doc=await store.saveDocument('alice',article);
  await store.updateDocument('alice',doc.id,{revision:0,progress:0.8});
  const reset=await store.resetProgress('alice',doc.id,1);
  assert.equal(reset.progress,0);assert.equal(reset.revision,2);
  await assert.rejects(store.updateDocument('alice',doc.id,{revision:1,progress:0.9}),status(409));
  assert.equal((await store.getLibrary('alice')).documents[0].progress,0);
  await store.updateDocument('alice',doc.id,{revision:2,progress:0.1});
  assert.equal((await store.getLibrary('alice')).documents[0].progress,0.1);
 } finally {await store.close();}
});

test('job leases exclude overlapping workers and expired owners cannot release a new lease',async()=>{
 const store=createStore({memory:true});
 try {
  const results=await Promise.all([store.claimJob('refresh',100,1000),store.claimJob('refresh',100,1000)]);
  assert.equal(results.filter(Boolean).length,1);
  const owner=results.find(Boolean)!;
  assert.equal(await store.claimJob('refresh',100,1050),null);
  const replacement=await store.claimJob('refresh',100,1100);assert.ok(replacement);
  await store.releaseJob('refresh',owner);
  assert.equal(await store.claimJob('refresh',100,1150),null);
  await store.releaseJob('refresh',replacement);
  assert.ok(await store.claimJob('refresh',100,1150));
 } finally {await store.close();}
});

test('restoring preferences is opt-in and stale preference revisions roll back the import',async()=>{
 const store=createStore({memory:true});
 try {
  const initial=await store.getLibrary('alice');
  const preferences={...initial.preferences,theme:'dark' as const,autoAdvance:true,defaultView:'notebook' as const,readerPanel:'hidden' as const};
  const plan={documents:[],feeds:[],sources:[],warnings:[],preferences};
  await store.importSnapshots('alice',plan);
  assert.deepEqual((await store.getLibrary('alice')).preferences,initial.preferences);
  await store.importSnapshots('alice',plan,0);
  assert.deepEqual((await store.getLibrary('alice')).preferences,preferences);
  await assert.rejects(store.importSnapshots('alice',{...plan,documents:[{...article,highlights:[]}]},0),status(409));
  assert.equal((await store.getLibrary('alice')).documents.length,0);
 } finally {await store.close();}
});

test('restored feed history retains dispositions through refresh and repeated import',async()=>{
 const store=createStore({memory:true});
 const feed={title:'Source',url:'https://example.com/feed',folder:'Research'};
 const entry={feedUrl:feed.url,title:'Entry',url:'https://example.com/entry',author:'',summary:'Summary',publishedAt:null,state:'dismissed' as const};
 const plan={documents:[],feeds:[feed],sources:[],warnings:[],entries:[entry]};
 try {
  const first=await store.importSnapshots('alice',plan);assert.equal(first.entries,1);
  const library=await store.getLibrary('alice');const id=library.feeds[0].id;
  assert.equal(library.feeds[0].folder,'Research');
  await store.ingestFeed('alice',id,{entries:[{externalId:'publisher-guid',title:'Updated title',url:entry.url}]});
  const refreshed=await store.getLibrary('alice');assert.equal(refreshed.entries.length,1);assert.equal(refreshed.entries[0].state,'dismissed');
  await store.setEntryState('alice',refreshed.entries[0].id,'saved');
  await store.importSnapshots('alice',plan);
  const repeated=await store.getLibrary('alice');assert.equal(repeated.entries.length,1);assert.equal(repeated.entries[0].state,'saved');
 } finally {await store.close();}
});

test('workflow controls new capture destination without relocating existing documents',async()=>{
 const store=createStore({memory:true});
 try {
  const first=await store.saveDocument('alice',article);
  const library=await store.getLibrary('alice');
  await store.setPreferences('alice',{...library.preferences,workflow:'shortlist'},0);
  const second=await store.saveDocument('alice',{...article,url:'https://example.com/second'});
  assert.equal(second.folder,'later');
  assert.equal((await store.getLibrary('alice')).documents.find(d=>d.id===first.id)?.folder,'inbox');
  await store.updateDocument('alice',second.id,{revision:0,folder:'shortlist'});
  assert.equal((await store.getLibrary('alice')).documents.find(d=>d.id===second.id)?.folder,'shortlist');
 } finally {await store.close();}
});

test('original file storage preserves bytes, deduplicates and enforces ownership',async()=>{
 const store=createStore({memory:true});
 try {
  const bytes=Buffer.from('%PDF-1.7\nsynthetic fixture');
  const file=await store.saveAttachment('alice','original.pdf','application/pdf',bytes);
  const retry=await store.saveAttachment('alice','original.pdf','application/pdf',bytes);assert.equal(retry.id,file.id);
  assert.deepEqual(Buffer.from((await store.getAttachment('alice',file.id)).bytes),bytes);
  await assert.rejects(store.getAttachment('bob',file.id),status(404));
  await assert.rejects(store.saveAttachment('alice','bad.html','text/html',bytes),/Unsupported/);
 } finally {await store.close();}
});
