import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {parseEpub} from '../src/server/epub';

function fixture(overrides:Record<string,string>={}) {
  const files={
    mimetype:'application/epub+zip',
    'META-INF/container.xml':'<container><rootfiles><rootfile full-path="Book/package.opf"/></rootfiles></container>',
    'Book/package.opf':'<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>A test book</dc:title><dc:creator>Author</dc:creator></metadata><manifest><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
    'Book/two.xhtml':'<html><body><h1>Second chapter</h1><p>The end.</p></body></html>',
    'Book/one.xhtml':'<html><body><h1>First chapter</h1><p>Hello <em>reader</em>.</p><script>alert(1)</script><img src="https://tracking.example/pixel" alt="Cover"/></body></html>',
    ...overrides,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,strToU8(text)]))));
}
test('EPUB preserves metadata and spine order while stripping active content',()=>{
  const book=parseEpub(fixture());
  assert.equal(book.title,'A test book');assert.equal(book.author,'Author');assert.equal(book.category,'epub');
  assert.ok(book.text.indexOf('First chapter')<book.text.indexOf('Second chapter'));
  assert.match(book.text,/Hello reader\./);assert.doesNotMatch(book.html,/script|tracking.example/);
  assert.match(book.text,/Image: Cover/);
});
test('EPUB refuses missing sections, external section URLs and unsafe XML',()=>{
  assert.throws(()=>parseEpub(fixture({'META-INF/container.xml':'<!DOCTYPE a [<!ENTITY secret SYSTEM "file:///etc/passwd">]><container/>'})),/entities/);
  for(const href of ['missing.xhtml','https://example.com/chapter.xhtml','../../outside.xhtml']) {
    assert.throws(()=>parseEpub(fixture({'Book/package.opf':`<package><manifest><item id="x" href="${href}" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="x"/></spine></package>`})),/inside|not found/);
  }
});

test('EPUB serves declared raster resources and resolves forward chapter links with duplicate local IDs', async () => {
  const { epubFixture } = await import('./fixtures/epub');
  const { readEpubImage } = await import('../src/server/epub');
  const { JSDOM } = await import('jsdom');
  const bytes = epubFixture();
  const book = parseEpub(bytes);
  const dom = new JSDOM(book.html);
  try {
    const doc = dom.window.document;
    const headings = [...doc.querySelectorAll('h1')];
    assert.notEqual(headings[0].id, headings[1].id);
    const links = [...doc.querySelectorAll('a')];
    assert.equal(links[0].getAttribute('href'), `#${headings[1].id}`);
    assert.equal(links[1].getAttribute('href'), `#${headings[0].id}`);
    assert.equal(links[2].getAttribute('href'), `#${doc.querySelector('section')!.id}`);
    assert.equal(book.text, doc.body.textContent);
    const src = doc.querySelector('img')!.getAttribute('src')!;
    assert.match(src, /^\/api\/files\/[a-f0-9]{64}\/resources\/[a-f0-9]{64}$/);
    const image = readEpubImage(bytes, src.split('/').at(-1)!);
    assert.equal(image?.mime, 'image/png');
    assert.equal(Buffer.from(image!.bytes).toString('ascii',12,16), 'IHDR');
    assert.equal(readEpubImage(bytes, '0'.repeat(64)), null);
    assert.equal(readEpubImage(bytes, '../pixel.png'), null);
  } finally { dom.window.close(); }
});

test('EPUB rejects spoofed raster bytes and keeps SVG, external images and unsafe links inert', async () => {
  const { epubFixture } = await import('./fixtures/epub');
  const { readEpubImage } = await import('../src/server/epub');
  const { createHash } = await import('node:crypto');
  const bytes = epubFixture({
    'Book/images/pixel.png': '<svg onload="alert(1)"/>',
    'Book/one.xhtml': '<h1 id="same">Chapter</h1><img src="images/pixel.png" alt="Spoof"/><img src="https://example.com/a.png" alt="Remote"/><img src="data:image/svg+xml,evil" alt="SVG"/><a href="javascript:alert(1)">Unsafe</a><a href="../../outside.xhtml">Outside</a><a href="#missing">Missing</a>',
  });
  const book = parseEpub(bytes);
  assert.doesNotMatch(book.html, /<img|javascript:|https:/);
  assert.match(book.html, /<a>Unsafe<\/a><a>Outside<\/a><a>Missing<\/a>/);
  assert.match(book.text, /Image: Spoof/);
  assert.match(book.text, /Image: Remote/);
  assert.match(book.text, /Image: SVG/);
  assert.equal(readEpubImage(bytes, createHash('sha256').update('Book/images/pixel.png').digest('hex')), null);
});

test('EPUB image extraction enforces per-resource size and declared MIME', async () => {
  const { epubFixture } = await import('./fixtures/epub');
  const { readEpubImage } = await import('../src/server/epub');
  const { createHash } = await import('node:crypto');
  const key = createHash('sha256').update('Book/images/pixel.png').digest('hex');
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(oversized);
  oversized.write('IHDR',12,'ascii');
  const bytes = epubFixture({'Book/images/pixel.png': oversized});
  assert.equal(readEpubImage(bytes, key), null);
  assert.doesNotMatch(parseEpub(bytes).html, /<img/);
  const wrongMime = epubFixture({'Book/package.opf': '<package><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="image" href="images/pixel.png" media-type="image/jpeg"/></manifest><spine><itemref idref="one"/></spine></package>'});
  assert.equal(readEpubImage(wrongMime, key), null);
});

test('EPUB keeps public web links while rejecting embedded credentials and control characters', async () => {
  const { epubFixture } = await import('./fixtures/epub');
  const book = parseEpub(epubFixture({'Book/one.xhtml': '<h1>Links</h1><a href="https://example.com/read?q=1">Website</a><a href="https://user:secret@example.com/">Credentials</a><a href="java&#10;script:alert(1)">Control</a>'}));
  assert.match(book.html, /href="https:\/\/example.com\/read\?q=1" rel="noreferrer noopener">Website/);
  assert.match(book.html, /<a>Credentials<\/a><a>Control<\/a>/);
});
