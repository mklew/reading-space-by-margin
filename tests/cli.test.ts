import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const readToken = 'read_secret_0123456789';
const captureToken = 'capture_secret_0123456789';

async function cli(args: string[], env: Record<string, string> = {}) {
  const child = spawn(process.execPath, ['scripts/margin.mjs', ...args], {
    env: { ...process.env, MARGIN_URL: '', MARGIN_READ_TOKEN: readToken, MARGIN_CAPTURE_TOKEN: captureToken, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'close');
  assert.equal(`${stdout}${stderr}`.includes(readToken), false);
  assert.equal(`${stdout}${stderr}`.includes(captureToken), false);
  return { code, stdout, stderr };
}

async function withServer(handler: (req: IncomingMessage, res: ServerResponse) => void, run: (origin: string) => Promise<void>) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('CLI routes read commands with pagination and uses a separate token for capture', async () => {
  const requests: { url: string; authorization: string | undefined; method: string | undefined; body: string }[] = [];
  await withServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url!, authorization: req.headers.authorization, method: req.method, body });
      res.end(JSON.stringify({ ok: true }));
    });
  }, async origin => {
    for (const args of [['list', '--limit', '7', '--offset', '2'], ['search', 'tag:reading AND in:inbox'], ['read', 'id/with space'], ['save', 'https://example.com/article']]) {
      const result = await cli(args, { MARGIN_URL: origin });
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { ok: true });
    }
  });
  assert.equal(requests[0].url, '/api/library?limit=7&offset=2');
  assert.equal(new URL(requests[1].url, 'https://example.com').searchParams.get('query'), 'tag:reading AND in:inbox');
  assert.equal(requests[2].url, '/api/library/id%2Fwith%20space');
  for (const request of requests.slice(0, 3)) assert.equal(request.authorization, `Bearer ${readToken}`);
  assert.equal(requests[3].authorization, `Bearer ${captureToken}`);
  assert.equal(requests[3].method, 'POST');
  assert.deepEqual(JSON.parse(requests[3].body), { url: 'https://example.com/article' });
});

test('CLI validates configuration and arguments before sending requests', async () => {
  assert.equal((await cli(['help'])).code, 0);
  for (const origin of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?token=secret']) {
    const result = await cli(['list'], { MARGIN_URL: origin });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /MARGIN_URL/);
  }
  for (const args of [['list', '--limit', '101'], ['list', '--offset', '-1'], ['search'], ['read'], ['read', '..'], ['save', 'https://user:secret@example.com']]) {
    assert.equal((await cli(args)).code, 1);
  }
  const missing = await cli(['list'], { MARGIN_URL: 'http://localhost:3000', MARGIN_READ_TOKEN: '' });
  assert.match(missing.stderr, /MARGIN_READ_TOKEN/);
  const writeMissing = await cli(['save', 'https://example.com'], { MARGIN_URL: 'http://localhost:3000', MARGIN_CAPTURE_TOKEN: '' });
  assert.match(writeMissing.stderr, /MARGIN_CAPTURE_TOKEN/);
});

test('CLI never follows redirects or prints error bodies and redacts echoed credentials', async () => {
  let requests = 0;
  await withServer((_req, res) => {
    requests++;
    if (requests === 1) { res.writeHead(302, { Location: '/redirected' }); res.end(); }
    else if (requests === 2) { res.writeHead(403); res.end(`secret body ${readToken}`); }
    else res.end(JSON.stringify({ echo: `${readToken} ${captureToken}` }));
  }, async origin => {
    const redirected = await cli(['list'], { MARGIN_URL: origin });
    assert.equal(redirected.code, 1);
    assert.equal(requests, 1);
    const forbidden = await cli(['list'], { MARGIN_URL: origin });
    assert.equal(forbidden.code, 1);
    assert.match(forbidden.stderr, /HTTP 403/);
    assert.equal(forbidden.stderr.includes('secret body'), false);
    const echoed = await cli(['list'], { MARGIN_URL: origin });
    assert.equal(echoed.code, 0);
    assert.deepEqual(JSON.parse(echoed.stdout), { echo: '[REDACTED] [REDACTED]' });
  });
});

test('CLI rejects oversized and malformed response bodies', async () => {
  let request = 0;
  await withServer((_req, res) => { res.end(request++ ? '{broken' : 'x'.repeat(5 * 1024 * 1024 + 1)); }, async origin => {
    const oversized = await cli(['list'], { MARGIN_URL: origin });
    assert.equal(oversized.code, 1);
    assert.match(oversized.stderr, /5 MB/);
    const malformed = await cli(['list'], { MARGIN_URL: origin });
    assert.equal(malformed.code, 1);
    assert.match(malformed.stderr, /invalid JSON/);
  });
});


test('CLI bounds a stalled response body with its request timeout', { timeout: 20_000 }, async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{');
  }, async origin => {
    const result = await cli(['list'], { MARGIN_URL: origin });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /time out after 15 seconds/);
    assert.equal(result.stdout, '');
  });
});
