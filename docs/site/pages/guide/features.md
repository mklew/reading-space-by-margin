# Feature guide

This describes Margin’s current implementation. “Available” means code exists; it does not imply every format, device or hosting configuration has been verified.

## Capture and subscriptions

| Capability | Current behavior and limits |
| --- | --- |
| Public web articles | Fetches, extracts and sanitizes article content; some sites may block retrieval or extract poorly |
| Pasted text | Creates a reading item without fetching a source |
| RSS and Atom | Subscribe, group feeds, refresh and save or dismiss entries |
| Podcasts | Preserves supported audio enclosures from feeds |
| YouTube channels | Resolves supported channel URLs, imports descriptions and offers click-to-load video embeds; no generated transcripts |
| Phone capture | Web app and capture-token shortcut instructions; no dedicated native app |

## Reading and organization

| Capability | Current behavior and limits |
| --- | --- |
| Workflow folders | Triage, Shortlist and Classic modes; changing mode does not relocate existing items |
| Tags and favorites | Document organization, bulk actions and query filters |
| Saved views | Named, editable and pinnable boolean queries |
| Reading preferences | Light/dark/system theme, serif/sans, size, width, panel and launch preferences |
| Progress | Persists reading progress; explicit reset supports starting over |
| Notes and highlights | Document notes, passage highlights and highlight notes/tags |
| Notebook | Revisits annotations across documents |
| Find and speech | Search inside a document and browser-provided speech; voice availability depends on the browser/system |
| Keyboard controls | Configurable shortcuts with duplicate-binding validation |

## Documents and portability

PDF and EPUB uploads preserve originals and extract content for reading. EPUB parsing follows spine order and supports bounded raster images and internal links. PDF text is extracted by page. Original-page viewing is useful for scanned PDFs; OCR is not implemented. Upload requests are bounded to 4 MB.

JSON, CSV, OPML and ZIP transfer serve different purposes. ZIP backups include originals; CSV is metadata, not the full text and annotations. Imports preview results and handle supported duplicates. See [import and export](import-export.md).

## Tools and integrations

The [CLI](../reference/cli.md) lists, searches, reads and captures URLs. The [MCP adapter](../reference/mcp.md) exposes read-only list/search/read tools. The [HTTP API](../reference/api.md) separates library-read credentials from capture credentials.

## Not yet supported

- Multiple accounts per installation or collaborative workspaces.
- Offline-first synchronization and dedicated native applications.
- Public sharing links.
- AI summaries, chat, generated transcripts or OCR.
- Inbound email, Kindle delivery, signed webhooks and full provider synchronization.
- Full-fidelity fixed-layout EPUB rendering or advanced PDF annotation tools.
- Async large-file import/export and demonstrated large-library scaling.

The application stores an account’s library in one JSONB row. That simplifies atomic changes but creates a scaling constraint. See [storage](../architecture/storage.md).
