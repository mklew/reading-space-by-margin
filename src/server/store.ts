import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { defaultPreferences, type Document, type FeedEntry, type Highlight, type Library, type Preferences } from '../domain';
import { auth, fail, type Database, type Query } from './auth';
import {captureLocation} from '../workflow';
import { validateQuery } from '../query';
import type { ImportPlan } from './transfer';
export type Article=Pick<Document,'title'|'author'|'siteName'|'url'|'html'|'text'|'excerpt'|'wordCount'|'category'|'audioUrl'|'youtubeVideoId'>;
type ParsedFeed={title?:string; entries:Array<{youtubeVideoId?:string;audioUrl?:string;externalId?:string;title:string;url:string;author?:string;summary?:string;publishedAt?:string|null}>};
const blank=():Library=>({documents:[],highlights:[],feeds:[],entries:[],preferences:{...defaultPreferences},preferencesRevision:0});
export function decodeLibrary(value: unknown): Library {
  // Older Postgres writes applied the driver's JSON encoding to an already encoded string.
  for (let depth = 0; typeof value === 'string' && depth < 4; depth++) value = JSON.parse(value);
  if (!value || typeof value !== 'object' || !Array.isArray((value as Library).documents) || !(value as Library).preferences) throw new Error('Invalid stored library.');
  return value as Library;
}
const schema=[
  'CREATE TABLE IF NOT EXISTS attachments (id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BYTEA NOT NULL,PRIMARY KEY(user_id,id))',
  'CREATE TABLE IF NOT EXISTS job_leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS libraries (user_id TEXT PRIMARY KEY, data JSONB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL,password_hash TEXT NOT NULL,singleton INTEGER UNIQUE NOT NULL CHECK(singleton=1))',
  'CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),kind TEXT NOT NULL,expires BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY,count INTEGER NOT NULL,started BIGINT NOT NULL)',
];
export function createStore(options:{path?:string;memory?:boolean}={}) {
  let ready:Promise<Database>|undefined;
  function database():Promise<Database> {
    return ready ??= (async()=>{
      let db:Database;
      if(!options.memory && !options.path && process.env.DATABASE_URL) {
        const sql=postgres(process.env.DATABASE_URL,{max:5,prepare:false});
        const query:Query=async(text,params=[])=>await sql.unsafe(text,params as never[]);
        db={query,transaction:async fn=>await sql.begin(async tx=>await fn(async(text,params=[])=>await tx.unsafe(text,params as never[]))) as never,close:async()=>{await sql.end();}};
      } else {
        if(!options.memory && (process.env.VERCEL || process.env.NODE_ENV==='production') && !process.env.DATABASE_URL) fail('DATABASE_URL is required in production',503);
        const pg=new PGlite(options.memory ? undefined : options.path ?? process.env.READER_DATA_DIR ?? '.reader-data');
        db={query:async(text,params=[]) => (await pg.query<Record<string,any>>(text,params)).rows,transaction:fn=>pg.transaction(tx=>fn(async(text,params=[]) => (await tx.query<Record<string,any>>(text,params)).rows)),close:()=>pg.close()};
      }
      for(const statement of schema) await db.query(statement);
      return db;
    })();
  }
  async function mutate<T>(userId:string,fn:(library:Library)=>T):Promise<T> {
    return (await database()).transaction(async query=>{
      await query('INSERT INTO libraries (user_id,data) VALUES ($1,$2::text::jsonb) ON CONFLICT DO NOTHING',[userId,JSON.stringify(blank())]);
      const [row]=await query('SELECT data FROM libraries WHERE user_id=$1 FOR UPDATE',[userId]);
      const library=decodeLibrary(row.data);
      const result=fn(library);
      await query('UPDATE libraries SET data=$2::text::jsonb WHERE user_id=$1',[userId,JSON.stringify(library)]);
      return result;
    });
  }
  return {
    ...auth(database),
    async claimJob(name:string,durationMs=120000,now=Date.now()):Promise<string|null> {
      const owner=randomUUID();
      const rows=await (await database()).query('INSERT INTO job_leases (name,owner,expires) VALUES ($1,$2,$3) ON CONFLICT (name) DO UPDATE SET owner=EXCLUDED.owner,expires=EXCLUDED.expires WHERE job_leases.expires <= $4 RETURNING owner',[name,owner,now+durationMs,now]);
      return rows.length?owner:null;
    },
    async releaseJob(name:string,owner:string) {await (await database()).query('DELETE FROM job_leases WHERE name=$1 AND owner=$2',[name,owner]);},
    async accountIds():Promise<string[]> {return (await (await database()).query('SELECT id FROM accounts')).map(row=>row.id);},
    async close() { if(ready) await (await ready).close(); },
    async saveAttachment(userId:string,name:string,mime:string,bytes:Uint8Array) {
      if(!bytes.length||bytes.length>20*1024*1024)fail('Files must be between 1 byte and 20 MB.');
      if(!['application/pdf','application/epub+zip'].includes(mime))fail('Unsupported original file type.');
      const id=createHash('sha256').update(bytes).digest('hex');
      const cleanName=name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200)||'document';
      await (await database()).query('INSERT INTO attachments (id,user_id,name,mime,bytes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[id,userId,cleanName,mime,Buffer.from(bytes)]);
      return {id,name:cleanName,mime,size:bytes.length};
    },
    async getAttachment(userId:string,id:string):Promise<{name:string;mime:string;bytes:Uint8Array}> {
      const [row]=await (await database()).query('SELECT name,mime,bytes FROM attachments WHERE user_id=$1 AND id=$2',[userId,id]);
      if(!row)fail('File not found',404);
      return {name:row.name,mime:row.mime,bytes:new Uint8Array(row.bytes)};
    },
    async getLibrary(userId:string):Promise<Library> { const [row]=await (await database()).query('SELECT data FROM libraries WHERE user_id=$1',[userId]); return row ? decodeLibrary(row.data) : blank(); },
    saveDocument(userId:string,article:Article & {category?:Document['category'];attachmentId?:string}) { return mutate(userId,lib=>{
      const url=article.url;
      const existing=article.attachmentId ? lib.documents.find(doc=>doc.attachmentId===article.attachmentId) : url ? lib.documents.find(doc=>doc.url===url) : undefined; if(existing) return existing;
      const now=new Date().toISOString();
      const doc:Document={...article,url,id:randomUUID(),folder:captureLocation(lib.preferences),tags:[],note:'',progress:0,revision:0,createdAt:now,movedAt:now};
      lib.documents.unshift(doc); return doc;
    }); },
    saveView(userId:string,input:{id?:string;name:string;description:string;query:string;pinned:boolean;revision?:number}) { return mutate(userId,lib=>{
      const valid=validateQuery(input.query);
      if(!valid.valid)fail(valid.error);
      if(!input.name.trim()||input.name.length>100||input.description.length>1000)fail('Invalid view name or description.');
      const views=lib.views??=[];
      const existing=input.id?views.find(v=>v.id===input.id):undefined;
      if(input.id&&!existing)fail('View not found',404);
      if(existing&&existing.revision!==input.revision)fail('This view changed on another device.',409);
      const view={id:existing?.id??randomUUID(),name:input.name.trim(),description:input.description,query:input.query,pinned:input.pinned,revision:existing?existing.revision+1:0};
      if(existing)views[views.indexOf(existing)]=view;else {if(views.length>=100)fail('You can save up to 100 views.');views.push(view);}
      return view;
    }); },
    removeView(userId:string,id:string,revision:number) {return mutate(userId,lib=>{
      const view=lib.views?.find(v=>v.id===id);if(!view)fail('View not found',404);
      if(view.revision!==revision)fail('This view changed on another device.',409);
      lib.views=lib.views!.filter(v=>v.id!==id);
    });},
    importSnapshots(userId:string,plan:ImportPlan,preferencesRevision?:number) { return mutate(userId,lib=>{
      if(preferencesRevision!==undefined&&plan.preferences){if(lib.preferencesRevision!==preferencesRevision)fail('Preferences changed. Preview the import again.',409);lib.preferences=plan.preferences;lib.preferencesRevision++;}
      const report={documents:0,feeds:0,entries:0,views:0,duplicates:0,highlights:0,warnings:[...plan.warnings]};
      const now=new Date().toISOString();
      for(const item of plan.documents) {
        const {originalId,highlights,...article}=item;
        const id=originalId || `import-${createHash('sha256').update(JSON.stringify([item.title,item.html])).digest('hex')}`;
        if(lib.documents.some(d=>d.id===id || (!!item.url && d.url===item.url))) {report.duplicates++;continue;}
        const doc:Document={...article,id,folder:item.folder??'inbox',tags:[...new Set(item.tags??[])],note:item.note??'',progress:item.progress??0,revision:0,createdAt:item.createdAt??now,movedAt:now};
        for(const highlight of highlights) {
          if(highlight.start<0 || highlight.end<=highlight.start || doc.text.slice(highlight.start,highlight.end)!==highlight.quote) fail('Imported highlight does not match document text.');
          lib.highlights.push({...highlight,id:randomUUID(),documentId:id,createdAt:now});report.highlights++;
        }
        lib.documents.push(doc);report.documents++;
      }
      for(const feed of plan.feeds) {
        if(lib.feeds.some(f=>f.url===feed.url)) {report.duplicates++;continue;}
        lib.feeds.push({...feed,id:randomUUID(),checkedAt:null,error:null});report.feeds++;
      }
      for(const entry of plan.entries??[]) {
        const feed=lib.feeds.find(f=>f.url===entry.feedUrl);
        if(!feed){report.warnings.push('Skipped feed history with no matching subscription.');continue;}
        if(lib.entries.some(e=>e.feedId===feed.id&&e.url===entry.url)){report.duplicates++;continue;}
        const {feedUrl,...data}=entry;
        lib.entries.push({...data,id:createEntryId(feed.id,entry.url),feedId:feed.id});report.entries++;
      }
      for(const view of plan.views??[]) {
        const views=lib.views??=[];
        if(views.some(v=>v.id===view.id)) {report.duplicates++;continue;}
        const valid=validateQuery(view.query);if(!valid.valid)fail(valid.error);
        if(views.length>=100) {report.warnings.push(`Skipped view "${view.name}": maximum 100 views.`);continue;}
        views.push({...view,revision:0});report.views++;
      }
      if(plan.sources.length) report.warnings.push(`${plan.sources.length} URL-only items still require article capture.`);
      return report;
    }); },
    bulkDocuments(userId:string,items:{id:string;revision:number}[],patch:{folder?:Document['folder'];addTags?:string[]}) {return mutate(userId,lib=>{
      if(!items.length||items.length>100||new Set(items.map(i=>i.id)).size!==items.length)fail('Select between 1 and 100 distinct documents.');
      if(patch.folder!==undefined&&!['inbox','later','shortlist','archive','trash'].includes(patch.folder))fail('Invalid folder');
      const tags=[...new Set((patch.addTags??[]).map(t=>t.trim()).filter(Boolean))];
      if(tags.length>30||tags.some(t=>t.length>40))fail('Invalid tags');
      const docs=items.map(item=>{
        const doc=lib.documents.find(d=>d.id===item.id);if(!doc)fail('Document not found',404);
        if(doc.revision!==item.revision)fail('A selected document changed. Reload and select it again.',409);
        if(new Set([...doc.tags,...tags]).size>100)fail('A selected document would exceed 100 tags.');
        return doc;
      });
      for(const doc of docs) {
        if(patch.folder!==undefined){doc.folder=patch.folder;doc.movedAt=new Date().toISOString();}
        doc.tags=[...new Set([...doc.tags,...tags])];doc.revision++;
      }
      return {updated:docs.length};
    });},
    resetProgress(userId:string,id:string,revision:number) {return mutate(userId,lib=>{
      const doc=lib.documents.find(d=>d.id===id);if(!doc)fail('Document not found',404);
      if(doc.revision!==revision)fail('This document changed. Reload before resetting progress.',409);
      doc.progress=0;doc.revision++;return doc;
    });},
    updateDocument(userId:string,id:string,patch:Partial<Pick<Document,'folder'|'tags'|'note'|'progress'|'favorite'|'title'|'author'|'siteName'|'excerpt'>>&{revision:number}) { return mutate(userId,lib=>{
      const doc=lib.documents.find(d=>d.id===id); if(!doc) fail('Document not found',404);
      if(doc.revision!==patch.revision) fail('This document changed on another device. Reload before editing.',409);
      if(patch.folder!==undefined) { if(!['inbox','later','shortlist','archive','trash'].includes(patch.folder)) fail('Invalid folder'); doc.folder=patch.folder;doc.movedAt=new Date().toISOString(); }
      if(patch.tags!==undefined) doc.tags=[...new Set(patch.tags.map(t=>t.trim()).filter(Boolean))];
      for(const key of ['title','author','siteName','excerpt'] as const) {
        const value=patch[key];if(value===undefined)continue;
        if(typeof value!=='string'||value.length>(key==='excerpt'?5000:500)||(key==='title'&&!value.trim()))fail('Invalid document metadata.');
        doc[key]=value.trim();
      }
      if(patch.favorite!==undefined)doc.favorite=patch.favorite;
      if(patch.note!==undefined) doc.note=patch.note;
      if(patch.progress!==undefined) { if(!Number.isFinite(patch.progress)||patch.progress<0||patch.progress>1) fail('Invalid progress');doc.progress=Math.max(doc.progress,patch.progress); }
      doc.revision++; return doc;
    }); },
    addHighlight(userId:string,input:Omit<Highlight,'createdAt'>) { return mutate(userId,lib=>{
      const doc=lib.documents.find(d=>d.id===input.documentId); if(!doc) fail('Document not found',404);
      if(!Number.isInteger(input.start)||!Number.isInteger(input.end)||input.start<0||input.end<=input.start||input.end>doc.text.length||doc.text.slice(input.start,input.end)!==input.quote) fail('Highlight does not match the saved text');
      const existing=lib.highlights.find(h=>h.id===input.id);
      if(existing) { if(existing.documentId!==input.documentId||existing.start!==input.start||existing.end!==input.end||existing.note!==input.note) fail('Highlight ID already exists',409); return existing; }
      const highlight={...input,createdAt:new Date().toISOString()};lib.highlights.push(highlight);return highlight;
    }); },
    updateHighlight(userId:string,id:string,note:string,tags:string[]|undefined,revision:number) { return mutate(userId,lib=>{const h=lib.highlights.find(h=>h.id===id);if(!h) fail('Highlight not found',404);if((h.revision??0)!==revision)fail('Highlight changed on another device. Reload its current values before saving.',409);if(tags!==undefined){if(tags.length>30||tags.some(t=>t.length>40))fail('Invalid highlight tags');h.tags=[...new Set(tags.map(t=>t.trim()).filter(Boolean))];}h.note=note;h.revision=(h.revision??0)+1;return h;}); },
    removeHighlight(userId:string,id:string,revision:number) { return mutate(userId,lib=>{const h=lib.highlights.find(h=>h.id===id);if(!h)return;if((h.revision??0)!==revision)fail('Highlight changed on another device. Reload before removing it.',409);lib.highlights=lib.highlights.filter(h=>h.id!==id);}); },
    setPreferences(userId:string,prefs:Preferences,revision:number) { return mutate(userId,lib=>{if(lib.preferencesRevision!==revision) fail('Preferences changed on another device',409);lib.preferences=prefs;lib.preferencesRevision++;}); },
    setFeedFolder(userId:string,id:string,folder:string) {return mutate(userId,lib=>{const feed=lib.feeds.find(f=>f.id===id);if(!feed)fail('Feed not found',404);if(folder.length>100)fail('Folder name is too long.');feed.folder=folder.trim();});},
    subscribeFeed(userId:string,input:{title:string;url:string}) { return mutate(userId,lib=>{const existing=lib.feeds.find(f=>f.url===input.url);if(existing)return existing;const feed={...input,id:randomUUID(),checkedAt:null,error:null};lib.feeds.push(feed);return feed;}); },
    ingestFeed(userId:string,feedId:string,parsed:ParsedFeed) { return mutate(userId,lib=>{
      const feed=lib.feeds.find(f=>f.id===feedId);if(!feed)fail('Feed not found',404);
      for(const entry of parsed.entries) {
        const id=createEntryId(feedId,entry.externalId || entry.url);
        const existing=lib.entries.find(e=>e.id===id||e.feedId===feedId&&e.url===entry.url);
        const metadata={youtubeVideoId:entry.youtubeVideoId,audioUrl:entry.audioUrl,title:entry.title,url:entry.url,author:entry.author??'',summary:entry.summary??'',publishedAt:entry.publishedAt??null};
        if(existing) Object.assign(existing,metadata);
        else lib.entries.push({id,feedId,...metadata,state:'new'});
      }
      feed.checkedAt=new Date().toISOString();feed.error=null;
    }); },
    setFeedError(userId:string,id:string,message:string) { return mutate(userId,lib=>{const f=lib.feeds.find(f=>f.id===id);if(!f)fail('Feed not found',404);f.error=message;f.checkedAt=new Date().toISOString();}); },
    setEntryState(userId:string,id:string,state:FeedEntry['state']) { return mutate(userId,lib=>{const e=lib.entries.find(e=>e.id===id);if(!e)fail('Entry not found',404);e.state=state;}); },
    unsubscribeFeed(userId:string,id:string) { return mutate(userId,lib=>{lib.feeds=lib.feeds.filter(f=>f.id!==id);lib.entries=lib.entries.filter(e=>e.feedId!==id);}); },
  };
}
function createEntryId(feedId:string,key:string) { return `${feedId}:${key}`; }
export type Store=ReturnType<typeof createStore>;
const shared=globalThis as typeof globalThis & {readerStore?:Store};
export function getStore():Store { return shared.readerStore ??= createStore(); }
