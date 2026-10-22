import test from 'node:test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {epubFixture} from './fixtures/epub';
import {zipSync,strToU8} from 'fflate';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {GET,POST} from '../src/app/api/[...path]/route';
import {parseImport} from '../src/server/transfer';
import {parseFeed} from '../src/server/capture';
import {getStore} from '../src/server/store';

test('authenticated transfer routes preview, restore and export without duplicate writes',async()=>{
 const path=await mkdtemp(join(tmpdir(),'margin-api-'));
 process.env.READER_DATA_DIR=path;process.env.SETUP_SECRET='test-only-setup-code';
 let cookie='';
 const req=(route:string,body?:string,origin='http://localhost:3000')=>new NextRequest(`http://0.0.0.0:3000${route}`,{method:body===undefined?'GET':'POST',headers:{host:'localhost:3000',origin,cookie,'content-type':'application/json'},body});
 try {
  assert.equal((await GET(req('/api/cron/feeds'))).status,401);
  process.env.CRON_SECRET='test-only-cron-secret';
  assert.equal((await GET(req('/api/cron/feeds'))).status,401);
  const cron=await GET(new NextRequest('http://localhost:3000/api/cron/feeds',{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));
  assert.equal(cron.status,200);assert.equal((await cron.json()).refreshed,0);
  const unauthorized=await GET(req('/api/export'));assert.equal(unauthorized.status,401);
  const setup=await POST(req('/api/setup',JSON.stringify({username:'tester',password:'test-password-long-enough',setupCode:process.env.SETUP_SECRET})));assert.equal(setup.status,200);
  cookie=setup.headers.get('set-cookie')!.split(';')[0];
  const initial=await (await GET(req('/api/state'))).json();
  const preferenceCommand={action:'preferences',preferences:{...initial.preferences,shortcuts:{capture:'q'}},revision:initial.preferencesRevision};
  assert.equal((await POST(req('/api/command',JSON.stringify(preferenceCommand)))).status,200);
  const configured=await (await GET(req('/api/state'))).json();
  assert.equal(configured.preferences.shortcuts.capture,'q');
  assert.equal((await POST(req('/api/command',JSON.stringify({...preferenceCommand,revision:configured.preferencesRevision,preferences:{...initial.preferences,shortcuts:{capture:'/'}}})))).status,400);
  const capture=await POST(req('/api/command',JSON.stringify({action:'text',title:'Fixture',text:'Synthetic article body.'})));assert.equal(capture.status,200);
  const captured=await capture.json();
  const highlightId='11111111-1111-4111-8111-111111111111';
  assert.equal((await POST(req('/api/command',JSON.stringify({action:'highlight',id:highlightId,documentId:captured.id,start:0,end:9,quote:'Synthetic',note:''})))).status,200);
  assert.equal((await POST(req('/api/command',JSON.stringify({action:'highlight-note',id:highlightId,note:'Missing revision'})))).status,400);
  const edited=await POST(req('/api/command',JSON.stringify({action:'highlight-note',id:highlightId,note:'Newer note',revision:0})));
  assert.equal(edited.status,200);assert.equal((await edited.json()).revision,1);
  assert.equal((await POST(req('/api/command',JSON.stringify({action:'highlight-note',id:highlightId,note:'Stale note',revision:0})))).status,409);
  assert.equal((await POST(req('/api/command',JSON.stringify({action:'highlight-remove',id:highlightId,revision:0})))).status,409);
  const exported=await GET(req('/api/export'));assert.equal(exported.status,200);assert.equal(exported.headers.get('cache-control'),'no-store');
  const snapshot=await exported.json();snapshot.documents[0].id='restored-fixture';snapshot.documents[0].title='Restored';
  const input=JSON.stringify(snapshot);
  const preview=await POST(req('/api/import?filename=library.json',input));assert.equal(preview.status,200);assert.equal((await preview.json()).documents,1);
  assert.equal((await (await GET(req('/api/state'))).json()).documents.length,1);
  const apply=await POST(req('/api/import?filename=library.json&apply=true',input));assert.equal(apply.status,200);assert.equal((await apply.json()).documents,1);
  const retry=await POST(req('/api/import?filename=library.json&apply=true',input));assert.equal((await retry.json()).duplicates,1);
  const hostile=await POST(req('/api/import?filename=library.json&apply=true',input,'https://other.example'));assert.equal(hostile.status,403);
  for(const format of ['csv','opml','zip']) {const response=await GET(req(`/api/export?format=${format}`));assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>0);assert.match(response.headers.get('content-disposition')!,new RegExp(`\\.${format}`));}
  const userId=(await getStore().accountIds())[0];
  const feed=await getStore().subscribeFeed(userId,{title:'Test podcast',url:'https://example.com/podcast'});
  await getStore().ingestFeed(userId,feed.id,{entries:[{title:'Episode one',url:'https://example.com/episode',audioUrl:'https://example.com/audio.mp3',summary:'A synthetic episode summary.'}]});
  const entry=(await getStore().getLibrary(userId)).entries[0];
  const episode=await POST(req('/api/command',JSON.stringify({action:'save-entry',id:entry.id})));
  assert.equal(episode.status,200);const savedEpisode=await episode.json();
  assert.equal(savedEpisode.category,'podcast');assert.equal(savedEpisode.audioUrl,'https://example.com/audio.mp3');
  assert.equal(savedEpisode.text,'A synthetic episode summary.');
  const again=await POST(req('/api/command',JSON.stringify({action:'save-entry',id:entry.id})));
  assert.equal((await again.json()).id,savedEpisode.id);
  assert.equal((await getStore().getLibrary(userId)).entries[0].state,'saved');
  const videoFeedUrl='https://www.youtube.com/feeds/videos.xml?channel_id=UCLA_DiR1FfKNvjuUpBHmylQ';
  const videoFeed=await getStore().subscribeFeed(userId,{title:'Test video channel',url:videoFeedUrl});
  const parsedVideo=parseFeed('<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><title>Test video channel</title><entry><id>yt:video:abcDEF123_-</id><yt:videoId>abcDEF123_-</yt:videoId><title>Video fixture</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcDEF123_-"/><media:group><media:description>Clip description.</media:description></media:group></entry></feed>',videoFeedUrl);
  await getStore().ingestFeed(userId,videoFeed.id,parsedVideo);
  const videoEntry=(await getStore().getLibrary(userId)).entries.find(e=>e.feedId===videoFeed.id)!;
  assert.equal(videoEntry.youtubeVideoId,'abcDEF123_-');
  const savedVideoResponse=await POST(req('/api/command',JSON.stringify({action:'save-entry',id:videoEntry.id})));
  assert.equal(savedVideoResponse.status,200);const savedVideo=await savedVideoResponse.json();
  assert.equal(savedVideo.category,'video');assert.equal(savedVideo.text,'Clip description.');assert.equal(savedVideo.youtubeVideoId,'abcDEF123_-');
  const archive=await GET(req('/api/export?format=zip'));
  const restored=await parseImport('library.zip',Buffer.from(await archive.arrayBuffer()));
  assert.equal(restored.documents.find(d=>d.category==='podcast')?.audioUrl,savedEpisode.audioUrl);
  assert.equal(restored.documents.find(d=>d.category==='video')?.youtubeVideoId,'abcDEF123_-');
  assert.equal(restored.entries?.find(e=>e.feedUrl===videoFeedUrl)?.youtubeVideoId,'abcDEF123_-');
  const book=zipSync(Object.fromEntries(Object.entries({mimetype:'application/epub+zip','META-INF/container.xml':'<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>','book.opf':'<package><metadata><title>Uploaded book</title></metadata><manifest><item id="a" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>','chapter.xhtml':'<html><body><h1>A chapter</h1><p>A synthetic book.</p></body></html>'}).map(([name,value])=>[name,strToU8(value)])));
  const upload=()=>POST(new NextRequest('http://localhost:3000/api/upload?filename=test.epub',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000',cookie},body:new Uint8Array(book)}));
  const uploaded=await upload();assert.equal(uploaded.status,200);const savedBook=await uploaded.json();
  assert.equal(savedBook.category,'epub');assert.equal((await (await upload()).json()).id,savedBook.id);
  const original=await GET(req(`/api/files/${savedBook.attachmentId}`));assert.equal(original.status,200);
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()),book);
  const illustrated=await POST(new NextRequest('http://localhost:3000/api/upload?filename=illustrated.epub',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000',cookie},body:new Uint8Array(epubFixture())}));
  assert.equal(illustrated.status,200);
  const illustratedBook=await illustrated.json();
  const imagePath=illustratedBook.html.match(/src="([^"]+)"/)[1];
  const image=await GET(req(imagePath));
  assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
  assert.equal(image.headers.get('x-content-type-options'),'nosniff');
  assert.ok((await image.arrayBuffer()).byteLength>8);
  const other=await getStore().saveAttachment('another-owner','private.epub','application/epub+zip',Buffer.from('private fixture'));
  assert.equal((await GET(req(imagePath.replace(illustratedBook.attachmentId,other.id)))).status,404);
  const libraryTokenResponse=await POST(req('/api/command',JSON.stringify({action:'library-token'})));
  assert.equal(libraryTokenResponse.status,200);
  const libraryToken=(await libraryTokenResponse.json()).token;
  const captureToken=(await (await POST(req('/api/command',JSON.stringify({action:'capture-token'})))).json()).token;
  const tokenReq=(path:string,token:string,body?:object)=>new NextRequest(`http://localhost:3000${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',host:'localhost:3000',origin:'http://localhost:3000'},body:body?JSON.stringify(body):undefined});
  assert.equal((await GET(req('/api/library'))).status,401);
  assert.equal((await GET(tokenReq('/api/library',captureToken))).status,401);
  const listing=await GET(tokenReq('/api/library?query=Synthetic&limit=1',libraryToken));
  assert.equal(listing.status,200);assert.equal(listing.headers.get('cache-control'),'private, no-store');
  const listed=await listing.json();assert.equal(listed.documents.length,1);assert.ok(listed.total>=1);assert.equal(listed.documents[0].html,undefined);
  assert.equal((await GET(tokenReq('/api/library?limit=101',libraryToken))).status,400);
  const detail=await GET(tokenReq(`/api/library/${captured.id}`,libraryToken));assert.equal(detail.status,200);
  const detailed=await detail.json();assert.equal(detailed.document.text,'Synthetic article body.');assert.equal(detailed.highlights[0].note,'Newer note');
  assert.equal((await POST(tokenReq('/api/capture',libraryToken,{url:'https://example.com'}))).status,401);
  assert.equal((await POST(tokenReq('/api/command',libraryToken,{action:'library-token'}))).status,401);
  assert.equal((await GET(tokenReq(`/api/files/${savedBook.attachmentId}`,libraryToken))).status,401);
  const foreign=await getStore().saveDocument('other-library',{title:'Private',author:'',siteName:'',url:'',html:'<p>Private</p>',text:'Private',excerpt:'Private',wordCount:1});
  assert.equal((await GET(tokenReq(`/api/library/${foreign.id}`,libraryToken))).status,404);
  const bridge=createServer(async(incoming,outgoing)=>{
    try {
      const result=await GET(new NextRequest(`http://localhost${incoming.url}`,{headers:{authorization:incoming.headers.authorization??''}}));
      outgoing.writeHead(result.status,Object.fromEntries(result.headers));outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch {outgoing.writeHead(500);outgoing.end();}
  });
  try {
    await new Promise<void>((resolve,reject)=>{bridge.once('error',reject);bridge.listen(0,'127.0.0.1',resolve);});
    const address=bridge.address();assert.ok(address&&typeof address==='object');
    const output=await new Promise<string>((resolve,reject)=>{
      const child=spawn(process.execPath,['scripts/margin.mjs','read',captured.id],{env:{...process.env,MARGIN_URL:`http://127.0.0.1:${address.port}`,MARGIN_READ_TOKEN:libraryToken}});
      let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
      child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(new Error(error)));
    });
    assert.equal(JSON.parse(output).highlights[0].note,'Newer note');
    assert.ok(!output.includes(libraryToken));
    const mcpOutput=await new Promise<string>((resolve,reject)=>{
      const child=spawn(process.execPath,['scripts/margin-mcp.mjs'],{env:{...process.env,MARGIN_URL:`http://127.0.0.1:${address.port}`,MARGIN_READ_TOKEN:libraryToken}});
      let buffer='',result='';
      const timer=setTimeout(()=>{child.kill();reject(new Error('MCP integration timed out'));},10000);
      const send=(message:object)=>child.stdin.write(JSON.stringify(message)+'\n');
      child.on('error',error=>{clearTimeout(timer);reject(error);});
      child.stdout.on('data',chunk=>{
        buffer+=chunk;
        while(buffer.includes('\n')) {
          const end=buffer.indexOf('\n');const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
          if(message.id===1){
            send({jsonrpc:'2.0',method:'notifications/initialized'});
            send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'margin_read',arguments:{id:captured.id}}});
          }
          if(message.id===2){result=JSON.stringify(message);child.stdin.end();}
        }
      });
      child.on('close',code=>{clearTimeout(timer);code===0&&result?resolve(result):reject(new Error('MCP integration failed'));});
      send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'integration-test',version:'1'}}});
    });
    const mcpResult=JSON.parse(mcpOutput).result;
    assert.notEqual(mcpResult.isError,true);
    assert.equal(JSON.parse(mcpResult.content[0].text).highlights[0].note,'Newer note');
    assert.ok(!mcpOutput.includes(libraryToken));

  } finally {await new Promise<void>(resolve=>bridge.close(()=>resolve()));}
  assert.equal((await POST(req('/api/command',JSON.stringify({action:'revoke-library-tokens'})))).status,200);
  assert.equal((await GET(tokenReq('/api/library',libraryToken))).status,401);
  assert.equal(await getStore().authenticate(captureToken,'capture'),userId);
  const logout=await POST(req('/api/logout','{}'));assert.equal(logout.status,200);
  assert.equal((await GET(req('/api/export'))).status,401);
  assert.equal((await GET(req(imagePath))).status,401);
  assert.equal((await GET(req(`/api/files/${savedBook.attachmentId}`))).status,401);
 } finally {await getStore().close();await rm(path,{recursive:true,force:true});}
});
