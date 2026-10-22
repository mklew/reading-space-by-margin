import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { JSDOM } from 'jsdom';
import sanitize from 'sanitize-html';
import { unzip } from './transfer';
import type { Article } from './capture';

type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
type BookImage = { bytes: Uint8Array; mime: ImageMime };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const anchor = (path: string, fragment = '') => `epub-${hash(JSON.stringify([path, fragment]))}`;

function reference(base: string, value: string): { path: string; fragment: string } | null {
  try {
    const split = value.indexOf('#');
    const path = decodeURIComponent(split < 0 ? value : value.slice(0, split));
    const fragment = split < 0 ? '' : decodeURIComponent(value.slice(split + 1));
    if (/[\x00-\x1f\x7f]/.test(path + fragment)) return null;
    if (/^[a-z][a-z\d+.-]*:|^\/|[\\\0?]/i.test(path)) return null;
    const resolved = path ? posix.normalize(posix.join(posix.dirname(base), path)) : base;
    return resolved.startsWith('../') || resolved === '..' ? null : { path: resolved, fragment };
  } catch { return null; }
}

function openBook(bytes: Buffer) {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('EPUB exceeds 20 MB.');
  const files = new Map(unzip(bytes).map(entry => [entry.name, entry.bytes]));
  if (files.get('mimetype')?.toString().trim() !== 'application/epub+zip') throw new Error('Not a valid EPUB container.');
  const xml = (name: string) => {
    const source = files.get(name)?.toString('utf8');
    if (!source) throw new Error(`EPUB is missing ${name}.`);
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('EPUB XML declarations with external entities are unsupported.');
    return new JSDOM(source, { contentType: 'application/xml' });
  };
  const container = xml('META-INF/container.xml');
  const packagePath = container.window.document.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path');
  container.window.close();
  if (!packagePath || !files.has(packagePath)) throw new Error('EPUB package was not found.');
  return { files, packagePath, book: xml(packagePath) };
}

function imageResource(files: Map<string, Buffer>, path: string, mime: string | null): BookImage | null {
  const bytes = files.get(path);
  if (!bytes || !bytes.length || bytes.length > 5 * 1024 * 1024) return null;
  const valid = mime === 'image/png' ? bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR'
    : mime === 'image/jpeg' ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/gif' ? bytes.length >= 13 && ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))
    : mime === 'image/webp' ? bytes.length >= 16 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && ['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16))
    : false;
  return valid ? { bytes, mime: mime as ImageMime } : null;
}

export function readEpubImage(bytes: Buffer, resourceKey: string): BookImage | null {
  if (!/^[a-f0-9]{64}$/.test(resourceKey)) return null;
  const { files, packagePath, book } = openBook(bytes);
  try {
    for (const item of book.window.document.getElementsByTagNameNS('*', 'item')) {
      const target = reference(packagePath, item.getAttribute('href') || '');
      if (target && hash(target.path) === resourceKey) {
        const image = imageResource(files, target.path, item.getAttribute('media-type'));
        if (image) return image;
      }
    }
    return null;
  } finally { book.window.close(); }
}

export function parseEpub(bytes: Buffer): Article & { category: 'epub' } {
  const { files, packagePath, book } = openBook(bytes);
  const chapters: { path: string; dom: JSDOM }[] = [];
  try {
    const root = book.window.document;
    const title = root.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || 'Untitled book';
    const author = Array.from(root.getElementsByTagNameNS('*', 'creator')).map(e => e.textContent?.trim()).filter(Boolean).join(', ');
    const manifest = new Map(Array.from(root.getElementsByTagNameNS('*', 'item')).map(e => [e.getAttribute('id'), e]));
    const images = new Set<string>();
    for (const item of manifest.values()) {
      const target = reference(packagePath, item.getAttribute('href') || '');
      if (target && imageResource(files, target.path, item.getAttribute('media-type'))) images.add(target.path);
    }
    const spine = Array.from(root.getElementsByTagNameNS('*', 'itemref'));
    if (!spine.length || spine.length > 500) throw new Error('EPUB must contain between 1 and 500 reading sections.');
    const targets = new Set<string>();
    for (const ref of spine) {
      const item = manifest.get(ref.getAttribute('idref'));
      if (!item || item.getAttribute('media-type') !== 'application/xhtml+xml') throw new Error('EPUB contains an unsupported or missing reading section.');
      const target = reference(packagePath, item.getAttribute('href') || '');
      if (!target || !files.has(target.path)) throw new Error('EPUB section was not found inside the book.');
      if (chapters.some(chapter => chapter.path === target.path)) continue;
      const dom = new JSDOM(files.get(target.path)!.toString('utf8'));
      chapters.push({ path: target.path, dom });
      targets.add(anchor(target.path));
      const seen = new Set<string>();
      for (const element of dom.window.document.body.querySelectorAll('[id], a[name]')) {
        const original = element.getAttribute('id') || element.getAttribute('name');
        element.removeAttribute('id'); element.removeAttribute('name');
        if (!original || seen.has(original) || !sanitize.defaults.allowedTags.includes(element.tagName.toLowerCase())) continue;
        seen.add(original);
        const id = anchor(target.path, original);
        element.setAttribute('id', id);
        targets.add(id);
      }
    }
    const originalHash = hash(bytes);
    const sections = chapters.map(({ path, dom }) => {
      const body = dom.window.document.body;
      for (const img of body.querySelectorAll('img')) {
        const target = reference(path, img.getAttribute('src') || '');
        if (target && images.has(target.path)) img.setAttribute('src', `/api/files/${originalHash}/resources/${hash(target.path)}`);
        else img.replaceWith(dom.window.document.createTextNode(img.alt ? `[Image: ${img.alt}]` : ''));
      }
      for (const link of body.querySelectorAll('a')) {
        const href = link.getAttribute('href');
        const target = href === null ? null : reference(path, href);
        const id = target && anchor(target.path, target.fragment);
        if (id && targets.has(id)) link.setAttribute('href', `#${id}`);
        else {
          link.removeAttribute('href');
          if (href && !/[\x00-\x1f\x7f]/.test(href)) {
            try {
              const external = new URL(href);
              if (['https:', 'http:'].includes(external.protocol) && !external.username && !external.password) {
                link.setAttribute('href', external.href);
                link.setAttribute('rel', 'noreferrer noopener');
              }
            } catch {}
          }
        }
      }
      return `<section id="${anchor(path)}">${sanitize(body.innerHTML, {
        allowedTags: [...sanitize.defaults.allowedTags, 'img'],
        allowedAttributes: { '*': ['id'], a: ['href', 'rel'], img: ['src', 'alt'] },
        allowedSchemes: ['http', 'https'],
      })}</section>`;
    });
    const html = sections.join('\n');
    const rendered = new JSDOM(html);
    const text = rendered.window.document.body.textContent ?? '';
    rendered.window.close();
    if (!text.trim()) throw new Error('EPUB has no readable text. Scanned and encrypted books are not supported.');
    return { category: 'epub', title, author, siteName: 'EPUB', url: '', html, text, excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 280), wordCount: text.trim().split(/\s+/).length };
  } finally { for (const chapter of chapters) chapter.dom.window.close(); book.window.close(); }
}
