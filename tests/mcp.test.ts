import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import test from 'node:test';

const token = 'mcp_read_secret_0123456789';
function client(origin = 'http://127.0.0.1:1') {
  const child = spawn(process.execPath, ['scripts/margin-mcp.mjs'], { env: { ...process.env, MARGIN_URL: origin, MARGIN_READ_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] });
  const replies: any[] = [];
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { assert.equal(line.includes(token), false); replies.push(JSON.parse(line)); });
  function send(value: unknown) { child.stdin.write(`${JSON.stringify(value)}\n`); }
  async function response(id: number) {
    const deadline = Date.now() + 5000;
    while (!replies.some(item => item.id === id)) {
      if (Date.now() > deadline) throw new Error(`No response for ${id}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return replies.find(item => item.id === id);
  }
  async function initialize() {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    assert.equal((await response(1)).result.protocolVersion, '2025-06-18');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }
  async function close() {
    const closing = once(child, 'close');
    child.stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    const [code] = await closing;
    clearTimeout(timer);
    assert.equal(code, 0);
    assert.equal(stderr, '');
  }
  return { child, replies, send, response, initialize, close };
}

test('MCP handshake discovers only read tools and routes authenticated library reads', async () => {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    assert.equal(req.method, 'GET');
    requests.push(req.url!);
    res.end(JSON.stringify({ document: { title: 'Reading', echo: token } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const c = client(`http://127.0.0.1:${address.port}`);
  try {
    await c.initialize();
    c.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (await c.response(2)).result.tools;
    assert.deepEqual(tools.map((tool: any) => tool.name), ['margin_list', 'margin_search', 'margin_read']);
    assert.ok(tools.every((tool: any) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
    for (const [id, name, args] of [[3, 'margin_list', { limit: 3, offset: 2 }], [4, 'margin_search', { query: 'tag:book' }], [5, 'margin_read', { id: 'a/b c' }]] as const) {
      c.send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
      const response = await c.response(id);
      assert.equal(response.result.isError, false);
      assert.equal(JSON.parse(response.result.content[0].text).document.echo, '[REDACTED]');
    }
    assert.deepEqual(requests, ['/api/library?limit=3&offset=2', '/api/library?query=tag%3Abook', '/api/library/a%2Fb%20c']);
  } finally { await c.close(); server.closeAllConnections(); server.close(); }
});

test('MCP validates lifecycle, unknown methods and strict tool arguments without losing the session', async () => {
  const c = client();
  try {
    c.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal((await c.response(2)).error.code, -32000);
    await c.initialize();
    let id = 3;
    for (const args of [{ limit: 101 }, { offset: -1 }, { surprise: true }]) {
      c.send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'margin_list', arguments: args } });
      assert.equal((await c.response(id++)).error.code, -32602);
    }
    c.send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'margin_save', arguments: { url: 'https://example.com' } } });
    assert.equal((await c.response(8)).error.code, -32602);
    c.send({ jsonrpc: '2.0', id: 9, method: 'unknown' });
    assert.equal((await c.response(9)).error.code, -32601);
    c.child.stdin.write('{broken\n');
    c.send({ jsonrpc: '2.0', id: 10, method: 'ping' });
    assert.deepEqual((await c.response(10)).result, {});
    assert.ok(c.replies.some(reply => reply.error?.code === -32700));
    c.send({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'margin_list' } });
    assert.equal((await c.response(11)).result.isError, true);
  } finally { await c.close(); }
});

test('MCP bounds concurrency and cancellation releases a stalled request; EOF kills an active child', async () => {
  let received!: () => void;
  const first = new Promise<void>(resolve => { received = resolve; });
  const server = createServer((_req, res) => { res.writeHead(200); res.write('{'); received(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const c = client(`http://127.0.0.1:${address.port}`);
  try {
    await c.initialize();
    c.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'margin_list' } });
    await first;
    c.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'margin_list' } });
    assert.equal((await c.response(3)).error.code, -32000);
    c.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 2 } });
    await new Promise(resolve => setTimeout(resolve, 100));
    c.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'margin_list' } });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(c.replies.some(reply => reply.id === 2 || reply.id === 4), false);
  } finally { await c.close(); server.closeAllConnections(); server.close(); }
});

test('MCP rejects oversized unterminated input and exits', async () => {
  const c = client();
  const closed = once(c.child, 'close');
  c.child.stdin.write('x'.repeat(65537));
  const [code] = await closed;
  assert.equal(code, 0);
  assert.equal(c.replies[0].error.code, -32600);
});
