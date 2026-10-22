import test from 'node:test';
import assert from 'node:assert/strict';
import {captureLocation,workflowLocations} from '../src/workflow';
import {defaultPreferences,type Document} from '../src/domain';
test('workflow destinations and tabs match triage, shortlist and classic',()=>{
 assert.equal(captureLocation(defaultPreferences),'inbox');
 assert.deepEqual(workflowLocations(defaultPreferences,[]),['inbox','later','archive']);
 assert.equal(captureLocation({...defaultPreferences,workflow:'shortlist'}),'later');
 assert.deepEqual(workflowLocations({...defaultPreferences,workflow:'shortlist'},[]),['later','shortlist','archive']);
 assert.deepEqual(workflowLocations({...defaultPreferences,workflow:'classic'},[]),['later','archive']);
});
test('switching workflow keeps populated legacy locations accessible',()=>{
 const docs=[{folder:'inbox'},{folder:'shortlist'}] as Document[];
 assert.deepEqual(workflowLocations({...defaultPreferences,workflow:'classic'},docs),['later','archive','inbox','shortlist']);
});
