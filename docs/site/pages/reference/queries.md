# Saved-view query language

Saved views use boolean expressions over documents and annotations. CLI, API and MCP search use literal text instead; they do not evaluate this language.

## Useful examples

| Query | Selects |
| --- | --- |
| `in:inbox AND minutes__lt:10` | Inbox documents estimated below ten minutes |
| `tag:research AND NOT in:archive` | Research documents outside Archive |
| `has:highlights AND has:notes` | Documents with highlights and at least one note |
| `is:favorite OR tag:reference` | Favorites or reference-tagged documents |
| `progress__gt:0 AND progress__lt:100` | Partly read documents |
| `saved__gt:"1 week ago"` | Documents saved within the past week |
| `(tag:design OR tag:engineering) AND category:article` | Articles in either topic |

## Text and operators

Bare words match case-insensitive text across document content, metadata, notes, tags and associated highlights. Quote phrases containing spaces. Adjacent terms imply `AND`. `NOT` binds more tightly than `AND`, which binds more tightly than `OR`; parentheses make grouping explicit.

## Fields

| Field | Matching behavior |
| --- | --- |
| `tag:` | Exact document tag, case-insensitive |
| `in:` | `inbox`, `later`, `shortlist`, `archive` or `trash` |
| `author:`, `title:` | Case-insensitive substring |
| `domain:` | Exact host or a subdomain of that host |
| `category:` | Category, such as `article`, `pdf`, `epub`, `podcast` or `video` |
| `has:` | `highlights` or `notes` |
| `is:` | `favorite` |

The query predicate can recognize `in:trash`; a UI view can still apply its own collection filtering before evaluating a query.

## Comparisons

Use `__gt` for strictly greater than and `__lt` for strictly less than.

- `minutes`: estimated from words at 250 words/minute, rounded up with a minimum of one minute.
- `progress`: percentage between 0 and 100, even though storage uses a fraction.
- `saved`: an ISO date or quoted relative duration, such as `"2 days ago"`. Relative units include minutes, hours, days and weeks.

Queries allow at most 2,000 characters, 200 tokens and 15 nesting levels. Invalid syntax is rejected rather than silently selecting the whole library.
