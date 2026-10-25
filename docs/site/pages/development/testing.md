# Testing and verification

Margin uses Node’s built-in test runner with `tsx` for TypeScript. Vitest is not installed. VitePress builds the documentation website; it does not replace application tests.

## Commands

| Command | Checks |
| --- | --- |
| `npm run typecheck` | TypeScript consistency |
| `npm test` | Behavior tests under `tests/` |
| `npm run build` | Next.js production compilation and route generation |
| `npm run docs:build` | Public docs rendering, local search and internal link validation |

Some integration tests start loopback HTTP servers and subprocesses. Use an environment that permits local sockets. Tests use isolated databases and synthetic documents, not a live personal library.

## Coverage by boundary

| Area | Examples |
| --- | --- |
| Capture | Private-address rejection, redirects, streaming bounds, extraction and sanitization |
| Store | Ownership, deduplication, revisions, atomic bulk operations and progress reset |
| Authentication | Account setup, token scopes, revocation and persisted attempt limits |
| Transfer | ZIP bounds, original checksums, restore, metadata and annotation offsets |
| PDF / EPUB | Text extraction, spine order, raster resources and unsafe content |
| API / CLI / MCP | Real-handler bridges, pagination, credential isolation, protocol and timeout behavior |
| Queries / shortcuts | Parsing, field semantics, duplicate keys and editable-control suppression |

## Browser evidence

Historical browser checks in `docs/verification/local-workflows.md` use synthetic content and describe precisely what was exercised. Their test counts are milestone snapshots. Run the current suite for current results.

For a reader change, inspect desktop and narrow layouts, keyboard interaction, loading/error states, reload persistence and the specific operation affected. For deployment changes, verify the actual hosted installation and persistence after redeployment.

A green build does not prove provider integrations, cron execution, all document formats or every browser workflow.
