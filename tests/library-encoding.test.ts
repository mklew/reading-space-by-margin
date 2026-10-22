import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeLibrary} from '../src/server/store';
import {defaultPreferences} from '../src/domain';
test('recovers legacy Postgres JSON strings without losing library data',()=>{
 const library={documents:[{id:'retained'}],highlights:[],feeds:[],entries:[],preferences:defaultPreferences,preferencesRevision:2};
 assert.deepEqual(decodeLibrary(library),library);
 assert.deepEqual(decodeLibrary(JSON.stringify(JSON.stringify(library))),library);
 assert.throws(()=>decodeLibrary('{}'),/Invalid stored library/);
});
