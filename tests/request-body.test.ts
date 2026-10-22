import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonBody } from '../src/server/request-body';

test('JSON body accepts UTF-8 data within the actual byte limit', async () => {
  const body = JSON.stringify({title:'Żółw'});
  assert.deepEqual(await readJsonBody(new Request('https://margin.test',{method:'POST',body}),100),{title:'Żółw'});
});
test('chunked oversized bodies are stopped even without Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({start(controller){controller.enqueue(new Uint8Array(7));controller.enqueue(new Uint8Array(7));},cancel(){cancelled=true;}});
  const request = new Request('https://margin.test',{method:'POST',body:stream,duplex:'half'} as RequestInit);
  await assert.rejects(readJsonBody(request,10),{status:413});
  assert.equal(cancelled,true);
});
test('invalid JSON and oversized declared lengths fail clearly', async () => {
  await assert.rejects(readJsonBody(new Request('https://margin.test',{method:'POST',body:'no'})),/valid UTF-8 JSON/);
  await assert.rejects(readJsonBody(new Request('https://margin.test',{method:'POST',body:'{}',headers:{'content-length':'100'}}),10),{status:413});
});
