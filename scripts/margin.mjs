#!/usr/bin/env node

const help = `Margin CLI

  node scripts/margin.mjs list [--limit N] [--offset N]
  node scripts/margin.mjs search <query> [--limit N] [--offset N]
  node scripts/margin.mjs read <id>
  node scripts/margin.mjs save <url>
  node scripts/margin.mjs help

Set MARGIN_URL to your app origin. List, search and read use MARGIN_READ_TOKEN.
Save uses MARGIN_CAPTURE_TOKEN. Results are JSON. Node.js 20 or newer is required.
`;

function requestFor(args) {
  const [command, ...rest] = args;
  if (command === 'list' || command === 'search') {
    const query = command === 'search' ? rest.shift() : undefined;
    if (command === 'search' && (!query || query.startsWith('--'))) throw new Error('Search requires a query.');
    const params = new URLSearchParams();
    if (query !== undefined) params.set('query', query);
    const seen = new Set();
    while (rest.length) {
      const option = rest.shift();
      const value = rest.shift();
      if (!['--limit', '--offset'].includes(option) || seen.has(option)) throw new Error('Unknown or repeated pagination option.');
      const number = Number(value);
      if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(number) || (option === '--limit' && (number < 1 || number > 100))) {
        throw new Error('Limit must be 1–100; offset must be a nonnegative integer.');
      }
      seen.add(option);
      params.set(option.slice(2), value);
    }
    return { path: `/api/library?${params}`, tokenName: 'MARGIN_READ_TOKEN' };
  }
  if (command === 'read' && rest.length === 1 && rest[0] && !['.', '..'].includes(rest[0])) {
    return { path: `/api/library/${encodeURIComponent(rest[0])}`, tokenName: 'MARGIN_READ_TOKEN' };
  }
  if (command === 'save' && rest.length === 1) {
    let target;
    try { target = new URL(rest[0]); } catch { throw new Error('Save requires an HTTP or HTTPS URL.'); }
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Save requires an HTTP or HTTPS URL without credentials.');
    return { path: '/api/capture', tokenName: 'MARGIN_CAPTURE_TOKEN', body: { url: target.href } };
  }
  throw new Error('Invalid command. Run help for usage.');
}

function appOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Set MARGIN_URL to your app origin.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('MARGIN_URL must be an HTTPS origin without credentials, path, query or fragment. HTTP is allowed only on loopback.');
  }
  return url.origin;
}

async function run() {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && ['help', '--help', '-h'].includes(args[0]))) {
    process.stdout.write(help);
    return;
  }
  const request = requestFor(args);
  const origin = appOrigin(process.env.MARGIN_URL);
  const token = process.env[request.tokenName];
  if (!token || !/^[A-Za-z0-9_-]{16,200}$/.test(token)) throw new Error(`Set ${request.tokenName} to a valid token from Settings.`);
  let response;
  try {
    response = await fetch(new URL(request.path, origin), {
      method: request.body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(request.body ? { 'Content-Type': 'application/json' } : {}) },
      body: request.body ? JSON.stringify(request.body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Request failed (HTTP ${response.status}).`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The server returned an empty response.');
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Response exceeds the 5 MB limit.');
      }
      chunks.push(value);
    }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('The server returned invalid JSON.'); }
    let output = JSON.stringify(result, null, 2);
    for (const secret of [process.env.MARGIN_READ_TOKEN, process.env.MARGIN_CAPTURE_TOKEN]) {
      if (secret) output = output.replaceAll(secret, '[REDACTED]');
    }
    process.stdout.write(`${output}\n`);
  } catch (error) {
    if (error instanceof Error && ['Request failed (HTTP ', 'Response exceeds ', 'The server returned '].some(prefix => error.message.startsWith(prefix))) throw error;
    throw new Error('Request failed. Check the origin, network and server availability. Redirects are not followed; requests time out after 15 seconds.');
  }
}

run().catch(error => {
  process.stderr.write(`margin: ${error.message}\n`);
  process.exitCode = 1;
});
