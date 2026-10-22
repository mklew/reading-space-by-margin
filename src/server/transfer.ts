import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import sanitize from 'sanitize-html';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {preferencesSchema} from '../preferences';
import { validateQuery } from '../query';
import type { Folder, Library, SavedView, Preferences, FeedEntry } from '../domain';
import { canonicalUrl, type Article } from './capture';

export type ImportedDocument = Article & { attachmentId?:string; category?:'article'|'podcast'|'epub'|'pdf'|'video';youtubeVideoId?:string;audioUrl?:string; favorite?:boolean; originalId?: string; folder?: Folder; tags?: string[]; note?: string; progress?: number; createdAt?: string; highlights: { start: number; end: number; quote: string; note: string; tags?:string[] }[] };
export type ArchiveAttachment={id:string;name:string;mime:string;bytes:Uint8Array};
export type ImportPlan = { attachments?:ArchiveAttachment[]; entries?: (Omit<FeedEntry,'id'|'feedId'>&{feedUrl:string})[]; preferences?:Preferences; views?: SavedView[]; documents: ImportedDocument[]; sources: { url: string; title?: string; tags?: string[]; folder?: Folder; progress?:number; createdAt?:string }[]; feeds: { title: string; url: string; folder?:string }[]; warnings: string[] };
const INPUT_LIMIT = 20 * 1024 * 1024, EXPANDED_LIMIT = 50 * 1024 * 1024, ENTRY_LIMIT = 1000;
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const folder = (value: unknown): Folder => ['inbox', 'later', 'shortlist', 'archive', 'trash'].includes(String(value)) ? value as Folder : value === 'archived' || value === '1' ? 'archive' : 'inbox';
const tags = (value: unknown): string[] => [...new Set((value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : Array.isArray(value) ? value.map(v => typeof v === 'string' ? v : object(v).name) : string(value).split(/[,;]/)).filter((v): v is string => typeof v === 'string' && !!v.trim()).map(v => v.trim()))].slice(0, 100);
export function libraryCsv(library: Library): string {
  const columns = ['id', 'title', 'author', 'url', 'folder', 'tags', 'note', 'progress', 'createdAt'];
  const cell = (value: unknown) => { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return [columns, ...library.documents.map(d => columns.map(k => k === 'tags' ? d.tags.join(', ') : d[k as keyof typeof d]))].map(row => row.map(cell).join(',')).join('\r\n');
}
export function feedsOpml(library: Library): string {
  const groups=new Map<string,typeof library.feeds>();
  for(const feed of library.feeds){const name=feed.folder??'';groups.set(name,[...(groups.get(name)??[]),feed]);}
  const body=[...groups].map(([name,feeds])=>{const children=feeds.map(f=>`<outline type="rss" text="${escape(f.title)}" title="${escape(f.title)}" xmlUrl="${escape(f.url)}"/>`).join('');return name?`<outline text="${escape(name)}" title="${escape(name)}">${children}</outline>`:children;}).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Margin feeds</title></head><body>${body}</body></opml>`;
}
export async function exportArchive(library: Library, attachments:ArchiveAttachment[]=[]): Promise<Buffer> {
  const files:Record<string,Uint8Array>={ 'library.json': Buffer.from(JSON.stringify({ format: 'margin', version: 1, ...library }, null, 2)), 'library.csv': Buffer.from(libraryCsv(library)), 'feeds.opml': Buffer.from(feedsOpml(library)) };
  let size=Object.values(files).reduce((total,value)=>total+value.length,0);
  for(const attachment of attachments) {
    if(!/^[a-f0-9]{64}$/.test(attachment.id)||createHash('sha256').update(attachment.bytes).digest('hex')!==attachment.id)throw new Error('Invalid archive attachment.');
    size+=attachment.bytes.length;
    if(size>EXPANDED_LIMIT)throw new Error('Archive exceeds 50 MB. Export smaller collections or download originals individually.');
    files[`originals/${attachment.id}`]=attachment.bytes;
  }
  files['originals.json']=Buffer.from(JSON.stringify(attachments.map(({id,name,mime})=>({id,name,mime}))));
  if(Object.keys(files).length>ENTRY_LIMIT)throw new Error('Archive exceeds 1000 files. Download originals individually.');
  if(Object.values(files).reduce((total,value)=>total+value.length,0)>EXPANDED_LIMIT)throw new Error('Archive exceeds 50 MB. Export smaller collections or download originals individually.');
  const archive=Buffer.from(zipSync(files));
  if(archive.length>INPUT_LIMIT)throw new Error('Archive exceeds the current 20 MB restore limit. Download originals individually.');
  return archive;
}
function snapshot(raw: Record<string, any>, plan: ImportPlan, name: string): void {
  if (Array.isArray(raw.highlights) && raw.highlights.length > 10000) throw new Error('Document exceeds 10000 highlights.');
  const attachmentId=plan.attachments?.some(file=>file.id===raw.attachmentId)?raw.attachmentId:undefined;
  if(raw.attachmentId&&!attachmentId)plan.warnings.push(`${name}: original attachment is not included in this snapshot. Extracted text and annotations will be restored; download originals separately before migrating.`);
  const url = raw.url ? canonicalUrl(string(raw.url)) : '';
  const book=raw.category==='epub';
  const bookImage=book&&plan.attachments?.some(file=>file.id===attachmentId&&file.mime==='application/epub+zip')?new RegExp(`^/api/files/${attachmentId}/resources/[a-f0-9]{64}$`):null;
  const html = sanitize(string(raw.html) || `<pre>${escape(string(raw.text ?? raw.content))}</pre>`, {
    allowedTags: sanitize.defaults.allowedTags.concat(['img', 'figure', 'figcaption']),
    allowedAttributes: { '*':['id'], a: ['href', 'title', 'rel'], img: ['src', 'alt'] },
    allowedSchemes: ['https', 'http'],
    transformTags: {
      '*': (tag,attrs)=>({tagName:tag,attribs:{...attrs,id:book&&/^epub-[a-f0-9]{64}$/.test(attrs.id??'')?attrs.id:''}}),
      a: (_tag, attrs) => ({ tagName: 'a', attribs: { ...attrs, href: book&&/^#epub-[a-f0-9]{64}$/.test(attrs.href??'')?attrs.href:safeLink(attrs.href, url), rel: 'noreferrer noopener' } }),
      img: (_tag, attrs) => ({ tagName: 'img', attribs: { src: bookImage?.test(attrs.src??'')?attrs.src:book?'':safeLink(attrs.src, url), alt: attrs.alt ?? '' } }),
    },
  });
  const dom = new JSDOM(html);
  const text = dom.window.document.body.textContent ?? ''; dom.window.close();
  const highlights: ImportedDocument['highlights'] = [];
  for (const h of Array.isArray(raw.highlights) ? raw.highlights : []) {
    if (Number.isInteger(h?.start) && Number.isInteger(h?.end) && h.start >= 0 && h.end > h.start && h.end <= text.length && text.slice(h.start, h.end) === h.quote) highlights.push({ start: h.start, end: h.end, quote: h.quote, note: string(h.note), tags:tags(h.tags) });
    else plan.warnings.push(`${name}: skipped a highlight whose offsets do not match sanitized text.`);
  }
  plan.documents.push({ attachmentId, title: string(raw.title) || name, author: string(raw.author), siteName: string(raw.siteName), url, html, text, excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 280), wordCount: text.trim() ? text.trim().split(/\s+/).length : 0, youtubeVideoId:typeof raw.youtubeVideoId==='string'&&/^[a-zA-Z0-9_-]{11}$/.test(raw.youtubeVideoId)?raw.youtubeVideoId:undefined,category:raw.category==='video'?'video':raw.category==='pdf'?'pdf':raw.category==='epub'?'epub':raw.category==='podcast'?'podcast':'article',audioUrl:raw.audioUrl?safeLink(string(raw.audioUrl),'')||undefined:undefined,favorite:raw.favorite===true, originalId: string(raw.id) || undefined, folder: folder(raw.folder ?? raw.status), tags: tags(raw.tags ?? raw.labels), note: string(raw.note), progress: typeof raw.progress === 'number' ? Math.max(0, Math.min(1, raw.progress)) : 0, createdAt: typeof raw.createdAt === 'string' && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : undefined, highlights });
}
function safeLink(value: string, base: string): string { if (!value) return ''; try { return canonicalUrl(new URL(value, base || undefined).href); } catch { return ''; } }
function readwiseTags(value: unknown): string[] {
  const source = string(value).trim();
  if (!source) return [];
  try { const parsed: unknown = JSON.parse(source); if (Array.isArray(parsed)) return tags(parsed); } catch {}
  if (!source.startsWith('[') || !source.endsWith(']')) throw new Error('Invalid Readwise tag list.');
  const result: string[] = [];
  let i = 1;
  while (i < source.length - 1) {
    while (/\s/.test(source[i] ?? '')) i++;
    if (i === source.length - 1) break;
    const quote = source[i++];
    if (quote !== "'" && quote !== '"') throw new Error('Invalid Readwise tag list.');
    let tag = '', closed = false;
    while (i < source.length - 1) {
      const c = source[i++];
      if (c === quote) { closed = true; break; }
      if (c === '\\') {
        const next = source[i++];
        if (next !== quote && next !== '\\') throw new Error('Unsupported Readwise tag escape.');
        tag += next;
      } else tag += c;
    }
    if (!closed) throw new Error('Invalid Readwise tag list.');
    result.push(tag);
    while (/\s/.test(source[i] ?? '')) i++;
    if (i < source.length - 1 && source[i++] !== ',') throw new Error('Invalid Readwise tag list.');
  }
  return tags(result);
}
function records(rows: unknown[], plan: ImportPlan, name: string, highlights: unknown[] = []): void {
  if (rows.length > ENTRY_LIMIT) throw new Error('Import exceeds 1000 records.');
  rows.forEach((value, i) => {
    try {
      const r = object(value), label = `${name} row ${i + 1}`;
      const raw: Record<string, any> = { ...r, url: r.url ?? r.URL ?? r.resolved_url ?? r.given_url, title: r.title ?? r.Title ?? r.resolved_title, folder: r.folder ?? r.status ?? r.Location ?? r.location, tags: r.tags ?? r.Tags ?? r.labels ?? (r['document tags'] !== undefined ? readwiseTags(r['document tags']) : undefined) };
      if (typeof raw.html === 'string' || typeof raw.text === 'string' || typeof raw.content === 'string') snapshot({ ...raw, highlights: r.highlights ?? highlights.filter(h => object(h).documentId === r.id) }, plan, label);
      else if (raw.url) {
        const progressValue = r.progress ?? r['reading progress'];
        const progress = Number(progressValue);
        const saved = string(r.createdAt ?? r.created_at ?? r.createdat ?? r['saved date']);
        plan.sources.push({ url: canonicalUrl(string(raw.url)), title: string(raw.title), tags: tags(raw.tags), folder: folder(raw.folder), ...(progressValue !== undefined && Number.isFinite(progress) && progress >= 0 && progress <= 1 ? {progress} : {}), ...(saved && Number.isFinite(Date.parse(saved)) ? {createdAt:new Date(saved).toISOString()} : {}) });
        if (r.highlights || r.note) plan.warnings.push(`${label}: URL-only import cannot restore annotations; use a snapshot export.`);
      }
      else plan.warnings.push(`${label}: no supported content or URL.`);
    } catch (error) { plan.warnings.push(`${name} row ${i + 1}: ${error instanceof Error ? error.message : 'Invalid record'}`); }
  });
}
function csv(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell.replace(/\r$/, '')); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else cell += c;
  }
  if (quoted) throw new Error('Unterminated CSV quoted field.');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
function parseFile(name: string, bytes: Buffer, plan: ImportPlan): void {
  const source = bytes.toString('utf8').replace(/^\uFEFF/, ''), ext = name.toLowerCase().split('.').pop();
  if (ext === 'json') {
    const data = JSON.parse(source), root = object(data);
    if (root.format === 'margin' && root.version !== 1) throw new Error('Unsupported Margin archive version.');
    const rows = Array.isArray(data) ? data : root.documents ?? root.items ?? root.articles ?? (root.list ? Object.values(root.list) : null);
    if (!Array.isArray(rows) && !Array.isArray(root.feeds)) throw new Error('Unrecognized JSON export. Expected documents, items, articles, or a Pocket list.');
    if (rows) records(rows, plan, name, Array.isArray(root.highlights) ? root.highlights : []);
    if (Array.isArray(root.feeds) && root.feeds.length > ENTRY_LIMIT) throw new Error('Import exceeds 1000 feeds.');
    for (const f of Array.isArray(root.feeds) ? root.feeds : []) { try { plan.feeds.push({ title: string(f.title), url: canonicalUrl(f.url), folder:string(f.folder).slice(0,100) }); } catch { plan.warnings.push(`${name}: skipped invalid feed URL.`); } }
    if (Array.isArray(root.views)) {
      if(root.views.length>100)throw new Error('Import exceeds 100 saved views.');
      plan.views??=[];
      for(const raw of root.views) {
        const v=object(raw), query=string(v.query), validation=validateQuery(query);
        if(!string(v.id)||!string(v.name).trim()||string(v.name).length>100||string(v.description).length>1000||!validation.valid) {plan.warnings.push(`${name}: skipped an invalid saved view.`);continue;}
        plan.views.push({id:v.id,name:v.name.trim(),description:string(v.description),query,pinned:v.pinned===true,revision:0});
      }
    }
    if(root.preferences){const parsed=preferencesSchema.safeParse(root.preferences);if(parsed.success)plan.preferences=parsed.data;else plan.warnings.push(`${name}: invalid reading preferences were skipped.`);}
    if(Array.isArray(root.entries)) {
      if(root.entries.length>10000)throw new Error('Import exceeds 10000 feed entries.');
      plan.entries??=[];
      const feedUrls=new Map((Array.isArray(root.feeds)?root.feeds:[]).map((f:any)=>[f.id,f.url]));
      for(const raw of root.entries)try {
        const e=object(raw),feedUrl=canonicalUrl(String(feedUrls.get(e.feedId)??'')),url=canonicalUrl(string(e.url));
        if(!['new','saved','dismissed'].includes(e.state))throw new Error();
        plan.entries.push({youtubeVideoId:typeof e.youtubeVideoId==='string'&&/^[a-zA-Z0-9_-]{11}$/.test(e.youtubeVideoId)?e.youtubeVideoId:undefined,audioUrl:e.audioUrl?canonicalUrl(string(e.audioUrl)):undefined,feedUrl,url,title:string(e.title),author:string(e.author),summary:string(e.summary),publishedAt:typeof e.publishedAt==='string'&&Number.isFinite(Date.parse(e.publishedAt))?e.publishedAt:null,state:e.state});
      }catch {plan.warnings.push(`${name}: skipped an invalid feed entry.`);}
    }
  } else if (ext === 'csv') {
    const [headers, ...rows] = csv(source);
    if (!headers?.some(h => /^(url|resolved_url|given_url)$/i.test(h.trim()))) throw new Error('CSV requires a URL column.');
    records(rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), r[i] ?? '']))), plan, name);
  } else if (ext === 'opml' || ext === 'xml') {
    if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) throw new Error('Invalid or unsafe OPML XML.');
    const data = new XMLParser({ ignoreAttributes: false, processEntities: true }).parse(source);
    if (!data.opml) throw new Error('XML import supports OPML subscriptions only.');
    const walk = (node: any, depth: number, group = '') => {
      if (depth > 50) throw new Error('OPML nesting exceeds 50 levels.');
      for (const o of Array.isArray(node) ? node : node ? [node] : []) {
        if (plan.feeds.length >= ENTRY_LIMIT) throw new Error('Import exceeds 1000 feeds.');
        if (o['@_xmlUrl']) { try { plan.feeds.push({ title: String(o['@_title'] ?? o['@_text'] ?? ''), url: canonicalUrl(o['@_xmlUrl']), folder:group.slice(0,100) }); } catch { plan.warnings.push(`${name}: skipped unsafe feed URL.`); } }
        walk(o.outline, depth + 1, o['@_xmlUrl']?group:String(o['@_title']??o['@_text']??group));
      }
    }; walk(data.opml.body?.outline, 0);
  } else if (ext === 'html' || ext === 'htm') {
    if (/NETSCAPE-Bookmark-file|<DL[\s>]/i.test(source)) {
      const dom = new JSDOM(source); records([...dom.window.document.querySelectorAll('a[href]')].map(a => ({ url: a.getAttribute('href'), title: a.textContent, tags: a.getAttribute('tags') })), plan, name); dom.window.close();
    } else snapshot({ html: source, title: name }, plan, name);
  } else if (['txt', 'md', 'markdown'].includes(ext ?? '')) snapshot({ text: source, title: name }, plan, name);
  else plan.warnings.push(`${name}: unsupported file type; skipped.`);
}
export function unzip(bytes: Buffer): { name: string; bytes: Buffer }[] {
  if (bytes.length < 22) throw new Error('Invalid ZIP directory.');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < Math.max(0, bytes.length - 65557) || bytes.readUInt32LE(end) !== 0x06054b50) throw new Error('Invalid ZIP directory.');
  const count = bytes.readUInt16LE(end + 10); let offset = bytes.readUInt32LE(end + 16), total = 0;
  if (count > ENTRY_LIMIT || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error('ZIP exceeds limits or uses unsupported spanning.');
  const entries: { name: string; bytes: Buffer }[] = [], names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP entry.');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24), nameLength = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'); offset += 46 + nameLength + extra + comment;
    if (!name || /[\\\0]/.test(name) || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..') || names.has(name)) throw new Error('Unsafe or duplicate ZIP path.');
    names.add(name); total += size;
    if (total > EXPANDED_LIMIT || flags & 1 || ![0, 8].includes(method)) throw new Error('ZIP exceeds 50 MB or uses unsupported encryption/compression.');
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP local entry.');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.length) throw new Error('Truncated ZIP entry.');
    const packed = bytes.subarray(start, start + compressed);
    const content = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: Math.max(1, Math.min(size, EXPANDED_LIMIT)) });
    if (content.length !== size) throw new Error('ZIP size mismatch.');
    if (!name.endsWith('/')) entries.push({ name, bytes: content });
  }
  return entries;
}
export async function parseImport(filename: string, bytes: Buffer): Promise<ImportPlan> {
  if (bytes.length > INPUT_LIMIT) throw new Error('Import exceeds 20 MB.');
  const plan: ImportPlan = { documents: [], sources: [], feeds: [], warnings: [] };
  if (/\.zip$/i.test(filename)) {
    const entries = unzip(bytes), native = entries.find(e => e.name === 'library.json');
    if(native) {
      const manifest=entries.find(entry=>entry.name==='originals.json');
      if(manifest) {
        const rows=JSON.parse(manifest.bytes.toString('utf8'));
        if(!Array.isArray(rows)||rows.length>ENTRY_LIMIT)throw new Error('Invalid originals manifest.');
        plan.attachments=[];
        for(const row of rows) {
          if(!/^[a-f0-9]{64}$/.test(row.id)||typeof row.name!=='string'||!['application/pdf','application/epub+zip'].includes(row.mime))throw new Error('Invalid original attachment metadata.');
          const original=entries.find(entry=>entry.name===`originals/${row.id}`);
          if(!original||!original.bytes.length||original.bytes.length>INPUT_LIMIT||createHash('sha256').update(original.bytes).digest('hex')!==row.id)throw new Error('Original attachment is missing or corrupted.');
          plan.attachments.push({id:row.id,name:row.name,mime:row.mime,bytes:original.bytes});
        }
      }
    }
    for (const entry of native ? [native] : entries) {
      if (plan.documents.length + plan.sources.length + plan.feeds.length > ENTRY_LIMIT) throw new Error('Import exceeds 1000 records.');
      try { parseFile(entry.name, entry.bytes, plan); } catch (error) { plan.warnings.push(`${entry.name}: ${error instanceof Error ? error.message : 'Invalid file'}`); }
    }
  } else parseFile(filename, bytes, plan);
  if (plan.documents.length + plan.sources.length + plan.feeds.length > ENTRY_LIMIT) throw new Error('Import exceeds 1000 records.');
  return plan;
}
