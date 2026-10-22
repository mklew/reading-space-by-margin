import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import sanitize from 'sanitize-html';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { resolveYouTubeFeedUrl, youtubeFeedVideoId } from './youtube';

export type Article = { title: string; author: string; siteName: string; url: string; html: string; text: string; excerpt: string; wordCount: number };
type FeedEntry = { youtubeVideoId?: string; audioUrl?:string; externalId: string; title: string; url: string; author: string; summary: string; publishedAt: string | null };
type Feed = { title: string; url: string; entries: FeedEntry[] };
const MAX_BYTES = 2 * 1024 * 1024;
function publicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    return parsed.range() === 'unicast' && (parsed.kind() === 'ipv4' || parsed.match(ipaddr.parse('2000::'), 3));
  } catch { return false; }
}
export function canonicalUrl(raw: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && url.port !== '80' && url.port !== '443')) throw new Error('Only public HTTP(S) URLs on standard ports are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if ((!host.includes('.') && !isIP(host)) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (isIP(host) && !publicAddress(host))) throw new Error('Private or reserved addresses are not allowed.');
  url.hash = '';
  return url.href;
}
export async function safeFetch(raw: string): Promise<{ body: string; url: string; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let current = canonicalUrl(raw);
    for (let redirects = 0; redirects <= 4; redirects++) {
      const url = new URL(current);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const records = await Promise.race([
        isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : lookup(host, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          if (controller.signal.aborted) reject(new Error('Retrieval timed out.'));
          else controller.signal.addEventListener('abort', () => reject(new Error('Retrieval timed out.')), { once: true });
        }),
      ]);
      if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('Private or reserved addresses are not allowed.');
      const selected = records[0];
      const response = await new Promise<{ body: string; status: number; location?: string; contentType: string }>((resolve, reject) => {
        const request = (url.protocol === 'https:' ? https : http).get(url, {
          agent: false, signal: controller.signal,
          headers: { 'User-Agent': 'MarginReader/1.0', Accept: 'text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml', 'Accept-Encoding': 'identity' },
          lookup: (_hostname, options, callback) => {
            if (typeof options === 'object' && options.all) callback(null, [selected]);
            else callback(null, selected.address, selected.family);
          },
        }, res => {
          const status = res.statusCode ?? 500;
          if ([301, 302, 303, 307, 308].includes(status)) { res.destroy(); resolve({ body: '', status, location: res.headers.location, contentType: '' }); return; }
          if (status < 200 || status >= 300) { res.destroy(); reject(new Error(`Source returned HTTP ${status}.`)); return; }
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.destroy(); reject(new Error('Compressed source responses are not supported.')); return; }
          if (Number(res.headers['content-length']) > MAX_BYTES) { res.destroy(); reject(new Error('Source exceeds 2 MB.')); return; }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > MAX_BYTES) { res.destroy(new Error('Source exceeds 2 MB.')); return; } chunks.push(chunk); });
          res.on('error', reject);
          res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), status, contentType: String(res.headers['content-type'] ?? '') }));
        });
        request.on('error', reject);
      });
      if (response.status >= 300 && response.status < 400) {
        if (!response.location || redirects === 4) throw new Error('Too many redirects or missing redirect location.');
        current = canonicalUrl(new URL(response.location, current).href);
      } else return { body: response.body, url: current, contentType: response.contentType };
    }
    throw new Error('Too many redirects.');
  } finally { clearTimeout(timeout); }
}
function text(value: unknown): string {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)['#text'] : value;
  return (JSDOM.fragment(sanitize(String(raw ?? ''), { allowedTags: [], allowedAttributes: {} })).textContent ?? '').replace(/\s+/g, ' ').trim();
}
function link(raw: unknown, base: string, image = false): string {
  if (!raw) return '';
  try { const result = canonicalUrl(new URL(String(raw), base).href); return image && !result.startsWith('https:') ? '' : result; } catch { return ''; }
}
function bounded(source: string) { if (Buffer.byteLength(source) > MAX_BYTES) throw new Error('Source exceeds 2 MB.'); }
export function extractArticle(source: string, rawUrl: string): Article {
  bounded(source);
  const url = canonicalUrl(rawUrl);
  const dom = new JSDOM(source, { url });
  try {
    const result = new Readability(dom.window.document).parse();
    if (!result?.content) throw new Error('No readable article was found. Try pasting the text instead.');
    const html = sanitize(result.content, {
      allowedTags: ['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'strong', 'em', 'b', 'i', 's', 'del', 'a', 'img', 'figure', 'figcaption', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub'],
      allowedAttributes: { a: ['href', 'title', 'rel'], img: ['src', 'alt', 'loading'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'] }, allowedSchemes: ['http', 'https'],
      transformTags: {
        a: (_tag, attrs) => ({ tagName: 'a', attribs: { href: link(attrs.href, url), title: text(attrs.title), rel: 'noreferrer noopener' } }),
        img: (_tag, attrs) => ({ tagName: 'img', attribs: { src: link(attrs.src, url, true), alt: text(attrs.alt), loading: 'lazy' } }),
      }, exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
    });
    const plainDom = new JSDOM(html);
    const plain = plainDom.window.document.body.textContent ?? '';
    plainDom.window.close();
    return { title: text(result.title) || new URL(url).hostname, author: text(result.byline), siteName: text(result.siteName) || new URL(url).hostname, url, html, text: plain, excerpt: plain.replace(/\s+/g, ' ').trim().slice(0, 280), wordCount: plain.trim() ? plain.trim().split(/\s+/).length : 0 };
  } finally { dom.window.close(); }
}
export async function fetchArticle(url: string): Promise<Article> {
  const response = await safeFetch(url);
  if (response.contentType && !/text\/html|application\/xhtml\+xml/i.test(response.contentType)) throw new Error('This URL does not return an HTML article.');
  return extractArticle(response.body, response.url);
}
type XmlNode = Record<string, any>;
const array = (value: unknown): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
export function parseFeed(xml: string, rawUrl: string): Feed {
  bounded(xml);
  const url = canonicalUrl(rawUrl);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Feed document types and entities are not supported.');
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid feed XML.');
  const data = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, trimValues: true, processEntities: true }).parse(xml) as XmlNode;
  const channel = data.rss?.channel ?? data.feed;
  if (!channel) throw new Error('Expected an RSS or Atom feed.');
  const entries: FeedEntry[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const item of array(channel.item ?? channel.entry)) {
    const candidate = array(item.link).find(l => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate'));
    const rawLink = candidate?.['@_href'] ?? (typeof item.link === 'string' ? item.link : '');
    const enclosure=array(item.enclosure).find(e=>String(e?.['@_type']??'').startsWith('audio/'))??array(item.link).find(e=>e?.['@_rel']==='enclosure'&&String(e['@_type']??'').startsWith('audio/'));
    const audioUrl=enclosure?link(enclosure['@_url']??enclosure['@_href'],url):undefined;
    const itemUrl = link(rawLink, url) || audioUrl;
    if (!itemUrl) continue;
    const title = text(item.title) || new URL(itemUrl).hostname;
    const summary = text(item.description ?? item.summary ?? item.content ?? item['content:encoded'] ?? item['media:group']?.['media:description']).slice(0, 2000);
    const externalId = text(item.guid ?? item.id) || createHash('sha256').update(itemUrl).digest('hex');
    if (seenIds.has(externalId) || seenUrls.has(itemUrl)) continue;
    seenIds.add(externalId); seenUrls.add(itemUrl);
    const date = new Date(text(item.pubDate ?? item.published ?? item.updated));
    const youtubeVideoId = youtubeFeedVideoId(url, itemUrl, item['yt:videoId']);
    entries.push({ ...(youtubeVideoId ? { youtubeVideoId } : {}), ...(audioUrl?{audioUrl}:{}), externalId, title, url: itemUrl, summary, author: text(item.author?.name ?? item.author ?? item['dc:creator']), publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString() });
    if (entries.length === 100) break;
  }
  return { title: text(channel.title) || new URL(url).hostname, url, entries };
}
export async function fetchFeed(url: string): Promise<Feed> { const feedUrl = await resolveYouTubeFeedUrl(canonicalUrl(url), safeFetch); const response = await safeFetch(feedUrl); return parseFeed(response.body, response.url); }
