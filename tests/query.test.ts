import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuery, filterDocuments, validateQuery } from '../src/query';
import { defaultPreferences, type Document, type Highlight, type Library } from '../src/domain';

const doc: Document = {
  id: 'one', title: 'Deep Work', author: 'Cal Newport', siteName: 'Example', url: 'https://blog.example.com/work',
  html: '', text: 'Focused attention improves creative practice.', excerpt: '', wordCount: 1500,
  folder: 'later', tags: ['Productivity', 'reading list'], note: '', progress: .5, revision: 0,
  createdAt: '2026-10-20T12:00:00Z', movedAt: '2026-10-20T12:00:00Z',
};
const annotation: Highlight = { id: 'h', documentId: 'one', start: 0, end: 7, quote: 'Focused', note: 'Try tomorrow', createdAt: doc.createdAt };
const now = new Date('2026-10-22T12:00:00Z');
const match = (query: string, highlights: Highlight[] = []) => matchesQuery(doc, highlights, query, now);

test('words, phrases, fields, and implicit AND search the document', () => {
  for (const query of ['', 'focus creative', '"Deep Work"', "title:'deep work' author:Newport", 'tag:productivity', 'tag:"reading list" in:later', 'domain:example.com', 'category:article']) assert.equal(match(query), true, query);
  for (const query of ['"work deep"', 'tag:productive', 'in:inbox', 'domain:ample.com', 'category:pdf']) assert.equal(match(query), false, query);
});

test('boolean precedence, grouping, and unary negation are respected', () => {
  assert.equal(match('in:later OR in:inbox AND tag:missing'), true);
  assert.equal(match('(in:later OR in:inbox) AND tag:missing'), false);
  assert.equal(match('NOT in:inbox AND NOT (tag:missing OR title:wrong)'), true);
  assert.equal(match('NOT NOT in:later'), true);
  assert.equal(match('in:later NOT tag:missing'), true);
  assert.equal(match('"OR"'), true);
});

test('highlight presence, notes, and text are scoped to the document', () => {
  const unrelated = { ...annotation, documentId: 'other' };
  for (const query of ['has:highlights', 'has:notes', 'tomorrow']) {
    assert.equal(match(query, [annotation]), true);
    assert.equal(match(query, [unrelated]), false);
  }
  assert.equal(matchesQuery({ ...doc, note: 'Local note' }, [], 'has:notes'), true);
});

test('comparisons use reading minutes, percentage progress, and strict bounds', () => {
  assert.equal(match('minutes__gt:5 AND minutes__lt:7'), true);
  assert.equal(match('minutes__gt:6'), false);
  assert.equal(match('progress__gt:49 AND progress__lt:51'), true);
  assert.equal(match('progress__lt:50'), false);
});

test('saved dates accept ISO and relative dates with an injected clock', () => {
  assert.equal(match('saved__gt:2026-10-19 AND saved__lt:2026-10-21'), true);
  assert.equal(match('saved__gt:"1 week ago" AND saved__lt:\'1 day ago\''), true);
  assert.equal(match('saved__gt:"2026-10-20T11:59:00Z"'), true);
  assert.equal(match('saved__gt:"2 days ago"'), false);
});

test('invalid expressions fail validation and never become an unfiltered result', () => {
  for (const query of ['AND title:work', 'title:', 'foo:bar', 'has:stars', 'in:unknown', '()', '(work', 'work)', 'work OR', 'work AND OR title:work', 'NOT', '"unfinished', '""', 'minutes__gt:no', 'progress__lt:101', 'saved__gt:2026-02-30', 'saved__lt:tomorrow']) {
    assert.equal(validateQuery(query).valid, false, query);
    assert.throws(() => match(query), query);
  }
});

test('input, token, and nesting limits reject bounded attacks', () => {
  for (const query of ['x'.repeat(2001), Array(201).fill('x').join(' '), '('.repeat(16) + 'work' + ')'.repeat(16), 'NOT '.repeat(16) + 'work']) assert.equal(validateQuery(query).valid, false);
  assert.equal(validateQuery('('.repeat(15) + 'work' + ')'.repeat(15)).valid, true);
  assert.equal(validateQuery('x'.repeat(2000)).valid, true);
});

test('filters a library without leaking another document’s annotations', () => {
  const other = { ...doc, id: 'two', title: 'Other', folder: 'archive' as const };
  const library: Library = { documents: [doc, other], highlights: [annotation], feeds: [], entries: [], preferences: defaultPreferences, preferencesRevision: 0 };
  assert.deepEqual(filterDocuments(library, 'has:notes', now).map(d => d.id), ['one']);
  assert.deepEqual(filterDocuments(library, 'in:archive', now).map(d => d.id), ['two']);
  assert.throws(() => filterDocuments(library, 'title:'));
});

test('favorites compose with saved filters and annotation tags are searchable',()=>{
 assert.equal(matchesQuery({...doc,favorite:true},[],'is:favorite AND in:later'),true);
 assert.equal(matchesQuery(doc,[],'is:favorite'),false);
 assert.equal(matchesQuery(doc,[{...annotation,tags:['distinctive-tag']}],'distinctive-tag'),true);
 assert.equal(matchesQuery(doc,[{...annotation,documentId:'other',tags:['distinctive-tag']}],'distinctive-tag'),false);
 assert.equal(validateQuery('is:unknown').valid,false);
});
