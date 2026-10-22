import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {parsePdf} from '@/server/pdf';
import {parseEpub,readEpubImage} from '@/server/epub';
import {assertSameOrigin} from '@/server/origin';
import {preferencesSchema as preferences} from '@/preferences';
import { getStore } from '@/server/store';
import { fetchArticle, fetchFeed } from '@/server/capture';
import type { Article } from '@/server/capture';
import { readJsonBody, readBodyBytes } from '@/server/request-body';
import { libraryCsv, feedsOpml, exportArchive, parseImport } from '@/server/transfer';

export const runtime = 'nodejs';
export const maxDuration = 60;
const folder = z.enum(['inbox','later','shortlist','archive','trash']);

const commands = z.discriminatedUnion('action', [
  z.object({action:z.literal('feed-folder'),id:z.string(),folder:z.string().trim().max(100)}),
  z.object({action:z.literal('reset-progress'),id:z.string(),revision:z.number().int()}),
  z.object({action:z.literal('bulk-documents'),items:z.array(z.object({id:z.string(),revision:z.number().int()})).min(1).max(100),folder:folder.optional(),addTags:z.array(z.string().trim().min(1).max(40)).max(30).optional()}),
  z.object({action:z.literal('save-view'),id:z.string().optional(),name:z.string().min(1).max(100),description:z.string().max(1000),query:z.string().max(2000),pinned:z.boolean(),revision:z.number().int().optional()}),
  z.object({action:z.literal('remove-view'),id:z.string(),revision:z.number().int()}),
  z.object({action:z.literal('import-source'),url:z.string().url().max(4096),title:z.string().max(500).optional(),tags:z.array(z.string().max(200)).max(100).optional(),folder:folder.optional(),progress:z.number().min(0).max(1).optional(),createdAt:z.string().datetime().optional()}),
  z.object({action:z.literal('capture'),url:z.string().url().max(4096)}),
  z.object({action:z.literal('text'),title:z.string().trim().min(1).max(500),text:z.string().trim().min(1).max(500000)}),
  z.object({action:z.literal('document'),favorite:z.boolean().optional(),id:z.string(),revision:z.number().int(),title:z.string().trim().min(1).max(500).optional(),author:z.string().max(500).optional(),siteName:z.string().max(500).optional(),excerpt:z.string().max(5000).optional(),folder:folder.optional(),tags:z.array(z.string().trim().min(1).max(40)).max(30).optional(),note:z.string().max(50000).optional(),progress:z.number().min(0).max(1).optional()}),
  z.object({action:z.literal('highlight'),id:z.string().uuid(),documentId:z.string(),start:z.number().int().min(0),end:z.number().int().positive(),quote:z.string().min(1).max(10000),note:z.string().max(10000)}),
  z.object({action:z.literal('highlight-note'),revision:z.number().int().min(0),id:z.string(),note:z.string().max(10000),tags:z.array(z.string().trim().min(1).max(40)).max(30).optional()}),
  z.object({action:z.literal('highlight-remove'),revision:z.number().int().min(0),id:z.string()}),
  z.object({action:z.literal('preferences'),preferences,revision:z.number().int()}),
  z.object({action:z.literal('subscribe'),url:z.string().url().max(4096)}),
  z.object({action:z.literal('refresh'),id:z.string()}),
  z.object({action:z.literal('unsubscribe'),id:z.string()}),
  z.object({action:z.literal('save-entry'),id:z.string()}),
  z.object({action:z.literal('dismiss-entry'),id:z.string()}),
  z.object({action:z.literal('capture-token')}),
  z.object({action:z.literal('library-token')}),
  z.object({action:z.literal('revoke-library-tokens')}),
  z.object({action:z.literal('revoke-tokens')}),
]);
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'The request could not be completed.';
  const status = error instanceof Error && 'status' in error && typeof error.status==='number' ? error.status : error instanceof z.ZodError ? 400 : /conflict|changed|revision/i.test(message) ? 409 : /unauthorized|sign in/i.test(message) ? 401 : /not found/i.test(message) ? 404 : 400;
  return NextResponse.json({error: error instanceof z.ZodError ? 'Check the supplied fields and try again.' : message},{status});
}
function sameOrigin(request:NextRequest) {assertSameOrigin(request,process.env.APP_ORIGIN);}
async function actor(request: NextRequest, capture = false) {
  const store = getStore();
  const bearer = request.headers.get('authorization');
  if (capture && bearer?.startsWith('Bearer ')) {
    const id = await store.authenticate(bearer.slice(7),'capture');
    if (!id) throw new Error('Unauthorized capture token.');
    return id;
  }
  const id = await store.authenticate(request.cookies.get('margin_session')?.value ?? '', 'session');
  if (!id) throw new Error('Please sign in to your library.');
  return id;
}
export async function GET(request: NextRequest) {
  try {
    const store = getStore();
    const path = request.nextUrl.pathname;
    if(path==='/api/library'||path.startsWith('/api/library/')) {
      const bearer=request.headers.get('authorization');
      const userId=bearer?.startsWith('Bearer ')?await store.authenticate(bearer.slice(7),'library-read'):null;
      if(!userId)return NextResponse.json({error:'A valid library read token is required.'},{status:401,headers:{'Cache-Control':'no-store'}});
      const library=await store.getLibrary(userId);
      const headers={'Cache-Control':'private, no-store'};
      if(path!=='/api/library') {
        const id=decodeURIComponent(path.slice('/api/library/'.length));
        const document=library.documents.find(doc=>doc.id===id&&doc.folder!=='trash');
        if(!document)return NextResponse.json({error:'Document not found'},{status:404,headers});
        return NextResponse.json({document,highlights:library.highlights.filter(highlight=>highlight.documentId===id)},{headers});
      }
      const params=z.object({query:z.string().max(2000).default(''),limit:z.coerce.number().int().min(1).max(100).default(20),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse(Object.fromEntries(request.nextUrl.searchParams));
      const query=params.query.toLowerCase();
      const matches=library.documents.filter(doc=>doc.folder!=='trash'&&(!query||[doc.title,doc.author,doc.text,...doc.tags].join(' ').toLowerCase().includes(query))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
      const documents=matches.slice(params.offset,params.offset+params.limit).map(({id,title,author,url,siteName,excerpt,folder,tags,category,createdAt,wordCount,progress})=>({id,title,author,url,siteName,excerpt,folder,tags,category,createdAt,wordCount,progress}));
      return NextResponse.json({documents,total:matches.length,limit:params.limit,offset:params.offset},{headers});
    }
    if(path === '/api/cron/feeds') {
      if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
      const lease=await store.claimJob('feed-refresh');
      if(!lease)return NextResponse.json({skipped:'Refresh already running'},{headers:{'Cache-Control':'no-store'}});
      try {
      const started=Date.now();let refreshed=0,failed=0,deferred=0;
      for(const userId of await store.accountIds()) {
        const library=await store.getLibrary(userId);
        const feeds=[...library.feeds].sort((a,b)=>(a.checkedAt??'').localeCompare(b.checkedAt??''));
        for(const feed of feeds) {
          if(Date.now()-started>40000){deferred++;continue;}
          try {await store.ingestFeed(userId,feed.id,await fetchFeed(feed.url));refreshed++;}
          catch(error){await store.setFeedError(userId,feed.id,error instanceof Error?error.message:'Scheduled refresh failed.');failed++;}
        }
      }
      return NextResponse.json({refreshed,failed,deferred},{headers:{'Cache-Control':'no-store'}});
      } finally {await store.releaseJob('feed-refresh',lease);}
    }
    if(path === '/api/session') {
      const userId = await store.authenticate(request.cookies.get('margin_session')?.value ?? '', 'session');
      return NextResponse.json({signedIn:!!userId,setupRequired:!(await store.hasAccount())},{headers:{'Cache-Control':'no-store'}});
    }
    const userId = await actor(request);
    const resource=path.match(/^\/api\/files\/([a-f0-9]{64})\/resources\/([a-f0-9]{64})$/);
    if(resource) {
      const file=await store.getAttachment(userId,resource[1]);
      const image=file.mime==='application/epub+zip'?readEpubImage(Buffer.from(file.bytes),resource[2]):null;
      if(!image)return NextResponse.json({error:'Image not found'},{status:404});
      return new NextResponse(new Uint8Array(image.bytes),{headers:{'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(path.startsWith('/api/files/')) {
      const id=path.slice('/api/files/'.length);
      if(!/^[a-f0-9]{64}$/.test(id))return NextResponse.json({error:'File not found'},{status:404});
      const file=await store.getAttachment(userId,id);
      const disposition=file.mime==='application/pdf'&&request.nextUrl.searchParams.get('view')==='true'?'inline':'attachment';
      return new NextResponse(new Uint8Array(file.bytes),{headers:{'Content-Type':file.mime,'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(path === '/api/state') return NextResponse.json(await store.getLibrary(userId),{headers:{'Cache-Control':'no-store'}});
    if(path === '/api/export') {
      const format = request.nextUrl.searchParams.get('format') ?? 'json';
      if (!['json', 'csv', 'opml', 'zip'].includes(format)) return NextResponse.json({error:'Choose JSON, CSV, OPML, or ZIP.'},{status:400});
      const library = await store.getLibrary(userId);
      const originals=[];
      if(format==='zip')for(const id of new Set(library.documents.map(doc=>doc.attachmentId).filter((id):id is string=>!!id)))originals.push({id,...await store.getAttachment(userId,id)});
      const body = format === 'csv' ? libraryCsv(library) : format === 'opml' ? feedsOpml(library) : format === 'zip' ? new Uint8Array(await exportArchive(library,originals)) : JSON.stringify({format:'margin',version:1,exportedAt:new Date().toISOString(),...library},null,2);
      const contentType = {json:'application/json',csv:'text/csv; charset=utf-8',opml:'application/xml; charset=utf-8',zip:'application/zip'}[format]!;
      return new NextResponse(body,{headers:{'Content-Type':contentType,'Content-Disposition':`attachment; filename="margin-${format === 'opml' ? 'feeds' : 'library'}.${format}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    return NextResponse.json({error:'Not found'},{status:404});
  } catch(error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const store = getStore();
    const path = request.nextUrl.pathname;
    if(path === '/api/login' || path === '/api/setup') {
      sameOrigin(request);
      const input = z.object({username:z.string().trim().min(3).max(80),password:z.string().min(12).max(200),setupCode:z.string().optional()}).parse(await readJsonBody(request));
      if(path === '/api/setup') await store.createAccount(input.username,input.password,input.setupCode ?? '');
      const token = await store.login(input.username,input.password);
      const response = NextResponse.json({ok:true});
      response.cookies.set('margin_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:60*60*24*30});
      return response;
    }
    if(path === '/api/logout') {
      sameOrigin(request);
      await store.logout(request.cookies.get('margin_session')?.value ?? '');
      const response=NextResponse.json({ok:true}); response.cookies.delete('margin_session'); return response;
    }
    if(path === '/api/upload') {
      sameOrigin(request);
      const userId=await actor(request);
      const filename=request.nextUrl.searchParams.get('filename')??'';
      if(filename.length>255||!/\.(epub|pdf)$/i.test(filename))throw new Error('Choose an EPUB or PDF file.');
      const bytes=Buffer.from(await readBodyBytes(request,4*1024*1024));
      const isPdf=/\.pdf$/i.test(filename);
      const article=isPdf?await parsePdf(bytes,filename):parseEpub(bytes);
      const original=await store.saveAttachment(userId,filename,isPdf?'application/pdf':'application/epub+zip',bytes);
      return NextResponse.json(await store.saveDocument(userId,{...article,attachmentId:original.id}),{headers:{'Cache-Control':'no-store'}});
    }
    if(path === '/api/import') {
      sameOrigin(request);
      const userId = await actor(request);
      const filename = request.nextUrl.searchParams.get('filename') ?? '';
      if(!filename || filename.length>255) throw new Error('Supply an import filename.');
      const plan = await parseImport(filename,Buffer.from(await readBodyBytes(request,20*1024*1024)));
      if(request.nextUrl.searchParams.get('apply') !== 'true') return NextResponse.json({attachments:plan.attachments?.length??0,entries:plan.entries?.length??0,hasPreferences:!!plan.preferences,views:plan.views?.length??0,documents:plan.documents.length,feeds:plan.feeds.length,sources:plan.sources.length,warnings:plan.warnings},{headers:{'Cache-Control':'no-store'}});
      for(const file of plan.attachments??[])await store.saveAttachment(userId,file.name,file.mime,file.bytes);
      return NextResponse.json({attachments:plan.attachments?.length??0,...await store.importSnapshots(userId,plan,request.nextUrl.searchParams.get('preferences')==='true'?Number(request.nextUrl.searchParams.get('revision')):undefined),pendingSources:plan.sources},{headers:{'Cache-Control':'no-store'}});
    }
    if(path !== '/api/command' && path !== '/api/capture') return NextResponse.json({error:'Not found'},{status:404});
    const tokenCapture = path === '/api/capture' && request.headers.get('authorization')?.startsWith('Bearer ');
    if(!tokenCapture) sameOrigin(request);
    const userId = await actor(request,path === '/api/capture');
    const raw = await readJsonBody(request);
    const command = commands.parse(path === '/api/capture' ? {action:'capture',url:z.object({url:z.string()}).parse(raw).url} : raw);
    let result: unknown = {ok:true};
    switch(command.action) {
      case 'feed-folder': await store.setFeedFolder(userId,command.id,command.folder);break;
      case 'reset-progress': result=await store.resetProgress(userId,command.id,command.revision);break;
      case 'bulk-documents': result=await store.bulkDocuments(userId,command.items,command);break;
      case 'save-view': result=await store.saveView(userId,command);break;
      case 'remove-view': await store.removeView(userId,command.id,command.revision);break;
      case 'import-source': {
        const article=await fetchArticle(command.url);
        result=await store.importSnapshots(userId,{documents:[{...article,title:command.title||article.title,tags:command.tags,folder:command.folder,progress:command.progress,createdAt:command.createdAt,highlights:[]}],feeds:[],sources:[],warnings:[]});
        break;
      }
      case 'capture': result=await store.saveDocument(userId,await fetchArticle(command.url)); break;
      case 'text': {
        const html = `<p>${command.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
        const article: Article={title:command.title,text:command.text,html,url:'',author:'',siteName:'Personal note',excerpt:command.text.slice(0,240),wordCount:command.text.split(/\s+/).length};
        result=await store.saveDocument(userId,article); break;
      }
      case 'document': { const {action,id,...patch}=command; void action; result=await store.updateDocument(userId,id,patch); break; }
      case 'highlight': {const {action,...input}=command; void action; result=await store.addHighlight(userId,input); break;}
      case 'highlight-note': result=await store.updateHighlight(userId,command.id,command.note,command.tags,command.revision); break;
      case 'highlight-remove': await store.removeHighlight(userId,command.id,command.revision); break;
      case 'preferences': await store.setPreferences(userId,command.preferences,command.revision); break;
      case 'subscribe': {
        const parsed=await fetchFeed(command.url); const feed=await store.subscribeFeed(userId,parsed);
        await store.ingestFeed(userId,feed.id,parsed); result=feed; break;
      }
      case 'refresh': {
        const data=await store.getLibrary(userId); const feed=data.feeds.find(f=>f.id===command.id);
        if(!feed) throw new Error('Feed not found.');
        try {await store.ingestFeed(userId,feed.id,await fetchFeed(feed.url));}
        catch(error) {await store.setFeedError(userId,feed.id,error instanceof Error?error.message:'Refresh failed.'); throw error;} break;
      }
      case 'unsubscribe': await store.unsubscribeFeed(userId,command.id); break;
      case 'save-entry': {
        const data=await store.getLibrary(userId); const entry=data.entries.find(e=>e.id===command.id);
        if(!entry) throw new Error('Feed entry not found.');
        if(entry.youtubeVideoId) {
          const text=entry.summary||'No description was provided for this video.';
          const html=`<p>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
          result=await store.saveDocument(userId,{title:entry.title,author:entry.author,siteName:data.feeds.find(f=>f.id===entry.feedId)?.title??'YouTube',url:entry.url,html,text,excerpt:text.slice(0,240),wordCount:text.split(/\s+/).length,category:'video',youtubeVideoId:entry.youtubeVideoId});
        } else if(entry.audioUrl) {
          const text=entry.summary||'No show notes were provided for this episode.';
          const html=`<p>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
          result=await store.saveDocument(userId,{title:entry.title,author:entry.author,siteName:data.feeds.find(f=>f.id===entry.feedId)?.title??'Podcast',url:entry.url,html,text,excerpt:text.slice(0,240),wordCount:text.split(/\s+/).length,category:'podcast',audioUrl:entry.audioUrl});
        } else result=await store.saveDocument(userId,await fetchArticle(entry.url));
        await store.setEntryState(userId,entry.id,'saved'); break;
      }
      case 'dismiss-entry': await store.setEntryState(userId,command.id,'dismissed'); break;
      case 'capture-token': result={token:await store.createCaptureToken(userId)}; break;
      case 'library-token': result={token:await store.createLibraryToken(userId)}; break;
      case 'revoke-library-tokens': await store.revokeLibraryTokens(userId); break;
      case 'revoke-tokens': await store.revokeCaptureTokens(userId); break;
    }
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return failure(error);}
}
