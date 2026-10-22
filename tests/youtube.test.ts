import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveYouTubeFeedUrl } from '../src/server/youtube';
import { parseFeed } from '../src/server/capture';

const channel = 'UC1234567890123456789012';
const feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`;
const noFetch = async (): Promise<never> => { throw new Error('Unexpected request'); };

test('channel URLs resolve without page retrieval and ordinary feeds pass through', async () => {
  for (const host of ['youtube.com', 'www.youtube.com', 'm.youtube.com']) {
    assert.equal(await resolveYouTubeFeedUrl(`https://${host}/channel/${channel}/videos`, noFetch), feed);
  }
  assert.equal(await resolveYouTubeFeedUrl(feed, noFetch), feed);
  assert.equal(await resolveYouTubeFeedUrl('https://example.com/feed', noFetch), 'https://example.com/feed');
  for (const path of ['/watch?v=abcdefghijk', '/playlist?list=abc', '/channel/UCbad', '/']) {
    await assert.rejects(resolveYouTubeFeedUrl(`https://www.youtube.com${path}`, noFetch), /channel or @handle/);
  }
  await assert.rejects(resolveYouTubeFeedUrl('https://youtu.be/abcdefghijk', noFetch), /channel or @handle/);
});

test('handle and legacy pages resolve only explicit channel metadata', async () => {
  for (const path of ['/@reader', '/user/reader', '/c/reader']) {
    let requested = '';
    const result = await resolveYouTubeFeedUrl(`https://www.youtube.com${path}`, async url => {
      requested = url;
      return { url, body: `<link rel="alternate" type="application/rss+xml" href="${feed}"><script>{"channelId":"UCabcdefghijklmnopqrstuv"}</script>` };
    });
    assert.equal(requested, `https://www.youtube.com${path}`);
    assert.equal(result, feed);
  }
  for (const metadata of [`<meta property="og:url" content="https://www.youtube.com/channel/${channel}">`, `<meta itemprop="channelId" content="${channel}">`]) {
    assert.equal(await resolveYouTubeFeedUrl('https://youtube.com/@reader', async url => ({ url, body: metadata })), feed);
  }
});

test('channel discovery rejects unrelated, ambiguous, oversized and redirected metadata', async () => {
  for (const body of [
    `<script>{"channelId":"${channel}"}</script>`,
    `<link rel="alternate" href="https://evil.example/feeds/videos.xml?channel_id=${channel}">`,
    `<meta itemprop="channelId" content="${channel}"><meta itemprop="channelId" content="UCabcdefghijklmnopqrstuv">`,
    '<link rel="alternate" href="http://[bad">',
  ]) await assert.rejects(resolveYouTubeFeedUrl('https://youtube.com/@reader', async url => ({url,body})), /Could not identify/);
  await assert.rejects(resolveYouTubeFeedUrl('https://youtube.com/@reader', async () => ({url:'https://evil.example',body:''})), /outside YouTube/);
  await assert.rejects(resolveYouTubeFeedUrl('https://youtube.com/@reader', async url => ({url,body:'x'.repeat(2*1024*1024+1)})), /exceeds/);
});

const atom = (videoId: string, watch: string) => `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><title>Channel</title><entry><id>yt:video:${videoId}</id><yt:videoId>${videoId}</yt:videoId><title>Episode</title><link rel="alternate" href="${watch}"/><media:group><media:description>Episode description</media:description></media:group></entry></feed>`;
test('official feed entries carry verified video IDs and media descriptions', () => {
  const xml = atom('abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk');
  const entry = parseFeed(xml, feed).entries[0];
  assert.equal(entry.youtubeVideoId, 'abcdefghijk');
  assert.equal(entry.summary, 'Episode description');
  assert.equal(parseFeed(atom('-62C9R_41Sc', 'https://www.youtube.com/shorts/-62C9R_41Sc'), feed).entries[0].youtubeVideoId, '-62C9R_41Sc');
  assert.equal(parseFeed(atom('abcdefghijk', 'https://www.youtube.com/shorts/-62C9R_41Sc'), feed).entries[0].youtubeVideoId, undefined);
  assert.equal(parseFeed(atom('-62C9R_41Sc', 'https://evil.example/shorts/-62C9R_41Sc'), feed).entries[0].youtubeVideoId, undefined);
  assert.equal(parseFeed(xml, 'https://example.com/feed').entries[0].youtubeVideoId, undefined);
  for (const [id,url] of [['abcdefghijk','https://evil.example/watch?v=abcdefghijk'], ['abcdefghijk','https://youtube.com/watch?v=otherother1'], ['bad','https://youtube.com/watch?v=bad']]) {
    assert.equal(parseFeed(atom(id,url),feed).entries[0].youtubeVideoId,undefined);
  }
});
