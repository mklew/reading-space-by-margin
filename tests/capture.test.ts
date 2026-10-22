import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, extractArticle, parseFeed, safeFetch } from '../src/server/capture';

test('canonical URL rejects private, encoded, reserved, credentialed and unsafe schemes or ports', () => {
  for (const url of ['http://localhost', 'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://10.1.2.3', 'http://169.254.169.254', 'http://192.168.1.1', 'http://100.64.0.1', 'http://224.0.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[fc00::1]', 'http://[fe80::1]', 'http://[2001:db8::1]', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com:8080']) assert.throws(() => canonicalUrl(url), url);
  assert.equal(canonicalUrl('HTTPS://EXAMPLE.COM:443/path#fragment'), 'https://example.com/path');
});
test('transport rejects internal destinations before network access', async () => {
  await assert.rejects(safeFetch('http://127.0.0.1/secret'));
  await assert.rejects(safeFetch('http://localhost/secret'));
});
test('article extraction strips active content and resolves safe source links', () => {
  const prose = 'This is a detailed article about gardening and the changing seasons. '.repeat(25);
  const result = extractArticle(`<html><head><title>Garden story</title></head><body><article><h1>Garden story</h1><p>${prose}</p><p><a href="/more" onclick="alert(1)">Read more</a><a href="javascript:alert(1)">Bad</a></p><img src="https://example.com/photo.jpg" onerror="alert(1)"><img src="http://127.0.0.1/private"><script>alert(1)</script><iframe src="https://example.com"></iframe><style>body{display:none}</style></article></body></html>`, 'https://example.com/story');
  assert.match(result.title, /Garden/);
  assert.match(result.html, /https:\/\/example.com\/more/);
  assert.doesNotMatch(result.html, /<script|<iframe|<style|onclick|onerror|javascript:|127\.0\.0\.1/);
  assert.ok(result.wordCount > 100);
  assert.ok(result.text.includes('changing seasons'));
});
test('RSS entries normalize, strip markup, deduplicate and reject unsafe links', () => {
  const feed = parseFeed(`<rss><channel><title>News</title><item><guid>one</guid><title>First</title><link>/a#part</link><description><![CDATA[<p>Hello <b>reader</b><script>evil()</script></p>]]></description><pubDate>2026-01-01</pubDate></item><item><guid>two</guid><link>/a</link></item><item><guid>one</guid><link>/b</link></item><item><link>javascript:alert(1)</link></item><item><link>http://127.0.0.1/x</link></item></channel></rss>`, 'https://example.com/feed');
  assert.equal(feed.entries.length, 1);
  assert.equal(feed.entries[0].url, 'https://example.com/a');
  assert.equal(feed.entries[0].summary, 'Hello reader');
  assert.equal(feed.entries[0].publishedAt, '2026-01-01T00:00:00.000Z');
});
test('Atom alternate links, authors, fallback IDs and invalid dates normalize', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>Story</title><link rel="self" href="/api/story"/><link rel="alternate" href="/story"/><author><name>Ada</name></author><updated>invalid</updated></entry></feed>`;
  const feed = parseFeed(xml, 'https://example.com/feed');
  assert.equal(feed.entries[0].author, 'Ada');
  assert.equal(feed.entries[0].url, 'https://example.com/story');
  assert.equal(feed.entries[0].publishedAt, null);
  assert.equal(feed.entries[0].externalId, parseFeed(xml, feed.url).entries[0].externalId);
});
test('feed rejects DTD and oversize input, caps entries at 100', () => {
  assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY x "boom">]><rss/>', 'https://example.com'));
  assert.throws(() => parseFeed('x'.repeat(2 * 1024 * 1024 + 1), 'https://example.com'));
  assert.throws(() => extractArticle('x'.repeat(2 * 1024 * 1024 + 1), 'https://example.com'));
  const xml = `<rss><channel>${Array.from({length: 150}, (_, i) => `<item><link>https://example.com/${i}</link></item>`).join('')}</channel></rss>`;
  assert.equal(parseFeed(xml, 'https://example.com/feed').entries.length, 100);
});

test('article text preserves browser text offsets including source whitespace', async () => {
  const { JSDOM } = await import('jsdom');
  const article = extractArticle(`<article><h1>Offset test</h1><p>First   paragraph\nwith source whitespace. ${'Readable article words. '.repeat(50)}</p><p>Second paragraph.</p></article>`, 'https://example.com/offsets');
  const dom = new JSDOM(article.html);
  assert.equal(article.text, dom.window.document.body.textContent);
  dom.window.close();
});

test('redirect targets are revalidated before another request', async t => {
  const { default: http } = await import('node:http');
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  let requests = 0;
  t.mock.method(http, 'get', (_url: URL, _options: unknown, callback: (response: unknown) => void) => {
    requests++;
    const response = Object.assign(new PassThrough(), { statusCode: 302, headers: { location: 'http://127.0.0.1/private' } });
    queueMicrotask(() => callback(response));
    return new EventEmitter();
  });
  await assert.rejects(safeFetch('http://93.184.216.34/article'), /Private/);
  assert.equal(requests, 1);
});

test('transport pins a checked IP and enforces streaming size bounds', async t => {
  const { default: http } = await import('node:http');
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  let pinned = '';
  t.mock.method(http, 'get', (_url: URL, options: { lookup: Function }, callback: (response: unknown) => void) => {
    options.lookup('untrusted-host', {}, (_error: unknown, address: string) => { pinned = address; });
    const response = Object.assign(new PassThrough(), { statusCode: 200, headers: { 'content-type': 'text/html' } });
    queueMicrotask(() => { callback(response); response.end(Buffer.alloc(2 * 1024 * 1024 + 1)); });
    return new EventEmitter();
  });
  await assert.rejects(safeFetch('http://93.184.216.34/article'), /exceeds 2 MB/);
  assert.equal(pinned, '93.184.216.34');
});

test('podcast audio enclosures survive RSS and Atom parsing without unsafe URLs',()=>{
 const rss=parseFeed('<rss><channel><title>Podcast</title><item><title>Episode</title><enclosure url="https://audio.example.org/episode.mp3" type="audio/mpeg"/></item></channel></rss>','https://example.org/feed');
 assert.equal(rss.entries[0].audioUrl,'https://audio.example.org/episode.mp3');
 assert.equal(rss.entries[0].url,rss.entries[0].audioUrl);
 const unsafe=parseFeed('<rss><channel><title>Podcast</title><item><link>https://example.org/episode</link><enclosure url="http://127.0.0.1/audio" type="audio/mpeg"/></item></channel></rss>','https://example.org/feed');
 assert.equal(unsafe.entries[0].audioUrl,undefined);
});
