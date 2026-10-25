# Library API

Margin separates tools by purpose. A library-read credential permits articles and annotations to be read. An existing capture credential only saves URLs. Session credentials are still required for preferences, token creation/revocation and other mutations. No read credential can mint credentials, mutate documents or download original attachments.

In Settings → Tool integrations, generate a read token and copy it once. Tokens expire after one year and are stored as hashes. Revoke read tokens disables every read token for the account without changing capture tokens. Token values are never returned by the library API or stored in the browser.

Use `Authorization: Bearer TOKEN` over HTTPS. Cookie sessions do not authorize these endpoints.

- `GET /api/library?query=words&limit=20&offset=0`: case-insensitive search across title, author, body and tags. Returns `{documents,total,limit,offset}`. Documents contain metadata and excerpt, not full HTML or notes. Limit 1–100, offset 0–1000000. Results ordered by saved date descending, ID ascending for ties. Trash is excluded.
- `GET /api/library/DOCUMENT_ID`: returns `{document,highlights}` including saved HTML/text, notes and annotations. Missing, trashed or foreign documents return 404.
- `POST /api/capture` with a capture token and JSON `{ "url": "https://example.com/article" }`: existing URL ingestion endpoint. Library-read tokens cannot use this operation.

Responses use no-store caching. Invalid or revoked credentials return 401. Malformed pagination/query parameters return 400. Listing uses offset pagination over current state; concurrent additions can shift pages, so it is not a backup protocol. Use the authenticated snapshot exports for backups.

## Design choice

A separate read token kind extends the existing purpose-specific capture-token model. A general grant table was considered but adds scope combinations, migrations and management UI before there is a demonstrated need. The selected boundary keeps existing phone tokens unable to read private documents. A future capability that needs write access must add an explicit boundary rather than accepting read tokens on session command routes.

## Verification

API tests cover credential separation, owner isolation, pagination validation, detail/annotation reads and revocation. CLI behavior is documented in the [CLI guide](cli.md). The read-only [MCP adapter](mcp.md) is implemented; webhooks remain future work.
