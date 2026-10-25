# Security boundaries

The browser, integration tools, fetched websites and database sit on different trust boundaries. Authorization belongs on the server even when the UI hides an action.

## Caller capabilities

| Caller | Authentication | Access |
| --- | --- | --- |
| Browser | Session cookie | Account library operations, settings and token management |
| Library tool | Library-read bearer token | List/search documents and read document content/annotations |
| Capture tool | Capture bearer token | Save a public URL |
| Scheduled refresh | Cron bearer secret | Feed refresh job |
| Fetched source | None | Untrusted input only |

Read tokens cannot capture, change settings, mint tokens or download originals. Capture tokens cannot read the library. Revoking one token kind does not revoke another.

## Authentication and browser requests

Passwords use salted scrypt hashes. Session and integration tokens are random opaque values stored as hashes. Setup and login attempts are persisted and bounded. Browser mutation requests undergo origin checks; deployments must configure their canonical `APP_ORIGIN` correctly.

## Untrusted content

URL capture rejects unsafe schemes, credential-bearing URLs and private/reserved destinations. Retrieval pins a checked address, validates redirects and bounds streamed content. HTML is sanitized. File and archive parsers enforce format and size checks, with additional protections against traversal and expansion attacks.

These controls need regression coverage whenever a new parser, protocol or adapter is added. They are not a substitute for dependency maintenance or a full security audit.

## Data privacy

The server can read library content. This is access-controlled storage, not end-to-end encryption. External media and explicitly loaded video embeds can contact third parties. Backups contain private content and must be protected separately.

For operational guidance and vulnerability reporting, see [security policy](../reference/security.md).
