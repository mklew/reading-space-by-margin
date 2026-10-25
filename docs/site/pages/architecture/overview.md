# Architecture

Margin is one Next.js application with a React interface, Node HTTP handlers and a server-owned library. The CLI and MCP adapter access the same scoped HTTP API; neither opens the database directly.

```text
Browser ── session cookie ─────────────┐
CLI ────── read or capture token ──────┤
MCP ────── CLI subprocess ─────────────┤
                                      ▼
                            Next.js HTTP handlers
                          validation · origin · auth
                                      │
                  ┌───────────────────┴──────────────────┐
                  ▼                                      ▼
          Library / auth store                    Capture / parsers
          ownership · revisions                   safe public fetch
          transactions · leases                   sanitized snapshots
                  │                                      │
                  └───────────────────┬──────────────────┘
                                      ▼
                      PostgreSQL / local PGlite
                      library JSONB + original bytes
```

## Application boundaries

| Layer | Responsibility | Source |
| --- | --- | --- |
| Interface | Library, reader, notebook and settings | `src/components/` |
| HTTP | Request validation, authentication, response shapes | `src/app/api/[...path]/route.ts` |
| Domain | Document, highlight, feed and preference types | `src/domain.ts` |
| Store | Ownership, atomic library changes and persistence | `src/server/store.ts` |
| Authentication | Account setup, passwords, scoped tokens and attempt limits | `src/server/auth.ts` |
| Capture | Public URL validation, extraction and feed parsing | `src/server/capture.ts` |
| File parsing | PDF, EPUB and archive handling | `src/server/pdf.ts`, `epub.ts`, `transfer.ts` |
| Integrations | Terminal and assistant adapters | `scripts/margin.mjs`, `margin-mcp.mjs` |

## Why this shape?

A server-owned library gives devices a shared source of truth and makes authorization consistent. The aggregate storage model keeps personal-library mutations atomic without coordinating many domain tables. It also loads and rewrites the complete library, so it trades simplicity for a clear scaling ceiling.

Local PGlite and production PostgreSQL use the same SQL schema. Production explicitly rejects the filesystem fallback. See [storage and concurrency](storage.md) for the actual schema and tradeoffs.

## Capture flow

A URL passes validation before retrieval. Retrieval bounds response size and validates destinations, including redirects. Extraction produces sanitized HTML and plain text. The store inserts under the library row lock, deduplicating an existing URL without replacing its snapshot.

Extraction happens before acquiring the library mutation lock. Network delays therefore do not need to hold that transaction open.

## Annotation flow

Highlights store a document ID, quote and start/end text offsets. Metadata edits preserve the saved snapshot so they do not shift those anchors. Changes to notes, tags and highlights carry expected revisions; stale edits fail instead of silently overwriting a newer change.

See [security boundaries](security.md) for what each caller can access and [testing](../development/testing.md) for the checks around these invariants.
