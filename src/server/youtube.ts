import { JSDOM } from 'jsdom';

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
type ChannelPage = { body: string; url: string; contentType?: string };

function officialUrl(raw: string, base?: string): URL | undefined {
  try {
    const url = new URL(raw, base);
    return HOSTS.has(url.hostname) && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.port ? url : undefined;
  } catch { return undefined; }
}
function feedUrl(id: string): string { return `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`; }
function feedChannel(url: URL): string | undefined {
  const id = url.searchParams.get('channel_id') ?? '';
  return url.pathname === '/feeds/videos.xml' && CHANNEL_ID.test(id) ? id : undefined;
}
function channelPath(url: URL): string | undefined {
  const match = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/(?:videos|shorts|streams|featured|about))?\/?$/);
  return match?.[1];
}

export async function resolveYouTubeFeedUrl(raw: string, fetchPage: (url: string) => Promise<ChannelPage>): Promise<string> {
  const url = officialUrl(raw);
  if (!url) {
    if (new URL(raw).hostname === 'youtu.be') throw new Error('Subscribe with a YouTube channel or @handle URL, not a video URL.');
    return raw;
  }
  const direct = feedChannel(url) ?? channelPath(url);
  if (direct) return feedUrl(direct);
  if (!/^\/(?:@[^/]+|(?:user|c)\/[^/]+)(?:\/(?:videos|shorts|streams|featured|about))?\/?$/.test(url.pathname)) {
    throw new Error('Subscribe with a YouTube channel or @handle URL, not a video or playlist URL.');
  }
  const response = await fetchPage(url.href);
  if (!officialUrl(response.url)) throw new Error('The YouTube channel redirected outside YouTube.');
  if (Buffer.byteLength(response.body) > 2 * 1024 * 1024) throw new Error('Source exceeds 2 MB.');
  if (response.contentType && !/text\/html|application\/xhtml\+xml/i.test(response.contentType)) throw new Error('The YouTube channel did not return an HTML page.');
  const dom = new JSDOM(response.body, { url: response.url });
  try {
    const ids = new Set<string>();
    for (const node of dom.window.document.querySelectorAll('link[rel~="alternate"][href]')) {
      const candidate = officialUrl(node.getAttribute('href')!, response.url);
      const id = candidate && feedChannel(candidate);
      if (id) ids.add(id);
    }
    for (const node of dom.window.document.querySelectorAll('meta[property="og:url"], link[rel="canonical"]')) {
      const value = node.getAttribute('content') ?? node.getAttribute('href');
      const candidate = value && officialUrl(value, response.url);
      const id = candidate && channelPath(candidate);
      if (id) ids.add(id);
    }
    for (const node of dom.window.document.querySelectorAll('meta[itemprop="channelId"], meta[name="channelId"]')) {
      const id = node.getAttribute('content') ?? '';
      if (CHANNEL_ID.test(id)) ids.add(id);
    }
    if (ids.size !== 1) throw new Error('Could not identify this YouTube channel. Paste its /channel/UC… URL instead.');
    return feedUrl([...ids][0]);
  } finally { dom.window.close(); }
}

export function youtubeFeedVideoId(feed: string, watch: string, rawId: unknown): string | undefined {
  const source = officialUrl(feed);
  const target = officialUrl(watch);
  if (!source || !feedChannel(source) || !target || typeof rawId !== 'string' || !VIDEO_ID.test(rawId)) return undefined;
  const targetId = target.pathname === '/watch' ? target.searchParams.get('v') : target.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  return targetId === rawId ? rawId : undefined;
}
