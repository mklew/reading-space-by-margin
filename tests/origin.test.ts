import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameOrigin} from '../src/server/origin';
const request=(origin:string,host='localhost:3000')=>new Request('http://0.0.0.0:3000/api/command',{headers:{origin,host}});
test('public localhost host is accepted despite internal bind address',()=>{
 assert.doesNotThrow(()=>assertSameOrigin(request('http://localhost:3000')));
 assert.throws(()=>assertSameOrigin(request('http://evil.example')),{status:403});
 assert.throws(()=>assertSameOrigin(request('null')),{status:403});
 assert.throws(()=>assertSameOrigin(request('http://localhost:3001')),{status:403});
});
test('configured production origin overrides internal proxy scheme and host',()=>{
 assert.doesNotThrow(()=>assertSameOrigin(request('https://reader.example'),'https://reader.example/'));
 assert.throws(()=>assertSameOrigin(request('http://localhost:3000'),'https://reader.example'),{status:403});
 assert.throws(()=>assertSameOrigin(request('https://reader.example'),'https://reader.example/path'),{status:503});
 assert.throws(()=>assertSameOrigin(request('https://reader.example'),'https://user:pass@reader.example'),{status:503});
});
test('missing origin and malformed host never authorize mutations',()=>{
 assert.throws(()=>assertSameOrigin(new Request('https://reader.example',{headers:{host:'reader.example'}})),{status:403});
 assert.throws(()=>assertSameOrigin(request('https://evil.example','reader.example@evil.example')),{status:503});
});
