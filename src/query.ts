import type { Document, Highlight, Library } from './domain';

type Field = 'tag' | 'in' | 'author' | 'title' | 'domain' | 'category' | 'has' | 'is';
type ComparisonField = 'minutes' | 'progress' | 'saved';
type Expr =
  | { kind: 'text'; value: string }
  | { kind: 'field'; field: Field; value: string }
  | { kind: 'compare'; field: ComparisonField; operator: 'gt' | 'lt'; value: number; relative: boolean }
  | { kind: 'and' | 'or'; left: Expr; right: Expr }
  | { kind: 'not'; child: Expr };
type Token = { value: string; kind: 'word' | 'quoted' | '(' | ')' | ':' };
const fields = new Set(['tag', 'in', 'author', 'title', 'domain', 'category', 'has', 'is']);

function tokenize(query: string): Token[] {
  if (query.length > 2000) throw new Error('Queries may contain at most 2000 characters.');
  const tokens: Token[] = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) { i++; continue; }
    const char = query[i++];
    if (char === '(' || char === ')' || char === ':') tokens.push({ kind: char, value: char });
    else if (char === '"' || char === "'") {
      let value = '';
      let closed = false;
      while (i < query.length) {
        const next = query[i++];
        if (next === char) { closed = true; break; }
        if (next === '\\') {
          if (i === query.length) throw new Error('Unfinished quoted escape.');
          value += query[i++];
        } else value += next;
      }
      if (!closed) throw new Error('Unclosed quoted phrase.');
      if (!value.trim()) throw new Error('Quoted phrases cannot be empty.');
      tokens.push({ kind: 'quoted', value });
    } else {
      let value = char;
      while (i < query.length && !/[\s():"']/.test(query[i])) value += query[i++];
      tokens.push({ kind: 'word', value });
    }
    if (tokens.length > 200) throw new Error('Queries may contain at most 200 tokens.');
  }
  return tokens;
}

function comparison(field: ComparisonField, operator: 'gt' | 'lt', value: string): Expr {
  if (field !== 'saved') {
    if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error('Comparisons require a nonnegative number.');
    const number = Number(value);
    if (field === 'progress' && number > 100) throw new Error('Progress must be between 0 and 100.');
    return { kind: 'compare', field, operator, value: number, relative: false };
  }
  const relative = /^(\d+)\s+(minute|hour|day|week)s?\s+ago$/i.exec(value);
  if (relative) {
    const units: Record<string, number> = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000 };
    const duration = Number(relative[1]) * units[relative[2].toLowerCase()];
    if (!Number.isSafeInteger(duration)) throw new Error('Relative date is too large.');
    return { kind: 'compare', field, operator, value: duration, relative: true };
  }
  const iso = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
  const timestamp = Date.parse(value);
  const day = Date.parse(value.slice(0, 10));
  if (!iso.test(value) || !Number.isFinite(timestamp) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error('Saved dates require an ISO date or a quoted relative date such as "1 week ago".');
  }
  return { kind: 'compare', field, operator, value: timestamp, relative: false };
}

function parse(query: string): Expr | null {
  const tokens = tokenize(query);
  let position = 0;
  const isOperator = (name: string) => tokens[position]?.kind === 'word' && tokens[position].value.toUpperCase() === name;
  function primary(depth: number): Expr {
    if (depth > 15) throw new Error('Queries may nest at most 15 levels.');
    if (isOperator('NOT')) { position++; return { kind: 'not', child: primary(depth + 1) }; }
    const token = tokens[position++];
    if (!token) throw new Error('Expected a search term.');
    if (token.kind === '(') {
      const expr = or(depth + 1);
      if (tokens[position++]?.kind !== ')') throw new Error('Expected a closing parenthesis.');
      return expr;
    }
    if (!['word', 'quoted'].includes(token.kind) || (token.kind === 'word' && /^(AND|OR)$/i.test(token.value))) throw new Error('Expected a search term.');
    if (tokens[position]?.kind !== ':') return { kind: 'text', value: token.value.toLowerCase() };
    if (token.kind !== 'word') throw new Error('Field names cannot be quoted.');
    position++;
    const value = tokens[position++];
    if (!value || !['word', 'quoted'].includes(value.kind) || (value.kind === 'word' && /^(AND|OR|NOT)$/i.test(value.value))) throw new Error(`Expected a value for ${token.value}.`);
    const field = token.value.toLowerCase();
    const compare = /^(minutes|progress|saved)__(gt|lt)$/.exec(field);
    if (compare) return comparison(compare[1] as ComparisonField, compare[2] as 'gt' | 'lt', value.value);
    if (!fields.has(field)) throw new Error(`Unknown field: ${token.value}.`);
    const normalized = value.value.toLowerCase();
    if(field==='is'&&normalized!=='favorite')throw new Error('Use is:favorite.');
    if (field === 'has' && !['highlights', 'notes'].includes(normalized)) throw new Error('Use has:highlights or has:notes.');
    if (field === 'in' && !['inbox', 'later', 'shortlist', 'archive', 'trash'].includes(normalized)) throw new Error('Unknown folder.');
    return { kind: 'field', field: field as Field, value: normalized };
  }
  function and(depth: number): Expr {
    let left = primary(depth);
    while (position < tokens.length && tokens[position].kind !== ')' && !isOperator('OR')) {
      if (isOperator('AND')) position++;
      left = { kind: 'and', left, right: primary(depth) };
    }
    return left;
  }
  function or(depth: number): Expr {
    let left = and(depth);
    while (isOperator('OR')) { position++; left = { kind: 'or', left, right: and(depth) }; }
    return left;
  }
  if (!tokens.length) return null;
  const result = or(0);
  if (position !== tokens.length) throw new Error('Unexpected closing parenthesis.');
  return result;
}

function evaluate(expr: Expr | null, doc: Document, highlights: Highlight[], now: Date): boolean {
  if (!expr) return true;
  switch (expr.kind) {
    case 'and': return evaluate(expr.left, doc, highlights, now) && evaluate(expr.right, doc, highlights, now);
    case 'or': return evaluate(expr.left, doc, highlights, now) || evaluate(expr.right, doc, highlights, now);
    case 'not': return !evaluate(expr.child, doc, highlights, now);
    case 'text': return [doc.title, doc.author, doc.siteName, doc.text, doc.excerpt, doc.note, ...doc.tags, ...highlights.flatMap(h => [h.quote, h.note, ...(h.tags??[])])].join('\n').toLowerCase().includes(expr.value);
    case 'compare': {
      const actual = expr.field === 'minutes' ? Math.max(1, Math.ceil(doc.wordCount / 250)) : expr.field === 'progress' ? doc.progress * 100 : Date.parse(doc.createdAt);
      const target = expr.relative ? now.getTime() - expr.value : expr.value;
      return expr.operator === 'gt' ? actual > target : actual < target;
    }
    case 'field': {
      switch (expr.field) {
        case 'tag': return doc.tags.some(tag => tag.toLowerCase() === expr.value);
        case 'in': return doc.folder === expr.value;
        case 'author': return doc.author.toLowerCase().includes(expr.value);
        case 'title': return doc.title.toLowerCase().includes(expr.value);
        case 'category': return ((doc as Document & { category?: string }).category ?? 'article').toLowerCase() === expr.value;
        case 'domain': {
          try { const host = new URL(doc.url).hostname.toLowerCase(); return host === expr.value || host.endsWith(`.${expr.value}`); } catch { return false; }
        }
        case 'is': return doc.favorite===true;
        case 'has': return expr.value === 'highlights' ? highlights.length > 0 : Boolean(doc.note.trim() || highlights.some(h => h.note.trim()));
      }
    }
  }
}

export function validateQuery(query: string): { valid: true } | { valid: false; error: string } {
  try { parse(query); return { valid: true }; }
  catch (error) { return { valid: false, error: error instanceof Error ? error.message : 'Invalid query.' }; }
}

export function matchesQuery(doc: Document, highlights: Highlight[], query: string, now = new Date()): boolean {
  return evaluate(parse(query), doc, highlights.filter(h => h.documentId === doc.id), now);
}

export function filterDocuments(library: Library, query: string, now = new Date()): Document[] {
  const expr = parse(query);
  const grouped = new Map<string, Highlight[]>();
  for (const highlight of library.highlights) {
    const list = grouped.get(highlight.documentId) ?? [];
    list.push(highlight);
    grouped.set(highlight.documentId, list);
  }
  return library.documents.filter(doc => evaluate(expr, doc, grouped.get(doc.id) ?? [], now));
}
