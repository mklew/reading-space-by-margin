# Comprehensive capability inventory

This inventory supersedes the initial future-only classification in the backlog. The user requested deeper product coverage on 2026-10-22. Observed means the control or explanation was inspected in the signed-in browser. It does not mean the workflow was executed or the feature is implemented here.

| Area | Observed capability | Delivery implications | Status |
| --- | --- | --- | --- |
| Profile | Export Library as CSV | Portable metadata export, formula-safe CSV, stable field schema | API and Settings implemented; browser verification pending |
| Profile | Export Feeds as OPML | Standards-based subscription export and matching import | Implemented and parser-tested; browser round trip pending |
| Profile | Export Full Files and Articles | Archive containing document content and annotations, plus recoverable import | Partial archive export implemented; original files and async Markdown ZIP outstanding |
| Integrations | Pocket Archive ZIP import | Parse archive, preserve metadata/tags/status, report partial failures and duplicates | Recognizable formats supported; real provider fixture verification pending |
| Integrations | Omnivore ZIP import | Parse archive and annotation data with bounded file extraction | Recognizable formats supported; real provider fixture verification pending |
| Integrations | Instapaper account synchronization | Provider authentication and incremental sync | Observed; provider dependency |
| Integrations | Twitter account settings | Capture integration and provider-specific access | Settings inspected; separate capture types and migration; adapter outstanding |
| Integrations | OpenAI API key and advanced Ghostreader models | Private credentials, document AI operations, explicit errors and spend controls | Observed; deeper inspection pending |
| Integrations | Send to Kindle | Document conversion and configured delivery identity | Setup inspected; approved sender/device address required; adapter outstanding |
| Integrations | MCP setup | Agent search/read/write tools with scoped authentication | Tool catalogue inspected; server outstanding |
| Integrations | CLI setup | Terminal library search, read, and mutations | Observed; implementation planned |
| Integrations | Webhooks | Real-time notifications for documents and highlights with signing/retries | Event controls and test-before-create inspected; implementation outstanding |
| Preferences | Light/dark/system theme | Persistent preference, responsive reader | Persistent preferences implemented; visual verification pending |
| Preferences | Default launch view | Choose initial collection/view | Implemented; browser verification pending |
| Preferences | Auto-advance after actions | Next document navigation rather than leaving reader | Implemented; browser verification pending |
| Preferences | Paragraph focus indicator | Keyboard reading position and paragraph actions | Observed; unimplemented |
| Preferences | Library workflow configuration | Multiple triage models, not only Inbox/Later/Archive | Triage/Shortlist/Classic implemented; capture routing tested |
| Preferences | Default side-panel visibility | Separate reading layout defaults | Implemented; browser verification pending |
| Preferences | Customize keyboard shortcuts | Discoverable mapping and user overrides | Observed; deeper inspection pending |
| Preferences | Desktop app deep links | Native shell distribution or an honest installed-PWA alternative | Observed; platform dependency |

| Add to Library | EPUB, PDF, OPML, XML, CSV upload; drag-and-drop; reference product advertises 500 MB | Format detection, bounded parsing, import report, document category and attachment model | Observed; unimplemented |
| Add to Library | Personal forwarding email address | Inbound email webhook, verified delivery, MIME parsing, inbox routing | Observed; external mail dependency |
| Add to Feed | OPML/XML import | Batch subscriptions with per-feed results and deduplication | Parser, preview and apply implemented; browser round trip pending |
| Add to Feed | Newsletter subscription and separate autoforward address | Separate feed routing for push-delivered email | Observed; external mail dependency |
| Add to Feed | Public Twitter lists and YouTube channels | Source adapters and scheduled polling | Observed; provider-dependent |
| Ghostreader | Enable/disable AI, global chat, custom instructions | User-level configuration and persistent conversations | Observed; unimplemented |
| Ghostreader | Automatic summaries and tagging | Configurable post-capture jobs, retry/error and spend controls | Observed; unimplemented |
| Ghostreader | Custom document/passage/word prompts | Prompt registry with context scope and editable templates | Observed; unimplemented |
| Ghostreader | Library research, digest, quizzes, triage, similar documents | Retrieval-backed library chat and reusable skills | Observed; unimplemented |
| Ghostreader | Translate, explain, recap, takeaways and newsletter drafting | Document/selection actions using configured provider | Observed; unimplemented |
| Ghostreader tools | Separate read/write permission defaults, per-tool allow/confirm/disable | Tool registry and explicit confirmation for mutations | Observed; unimplemented |
| Ghostreader tools | Search/list/read documents, metadata edits, tags, highlights, daily review | Shared service/API for agent and UI operations | Observed; unimplemented |
| Filtered views | Saved queries with description, count, edit/pin/delete | Typed query parser, dynamic results, sidebar pinning | Implemented; synthetic browser create/open verified |
| Filtered views | AND/OR, categories, tags, folders, reading minutes, dates, progress, highlights | Query language with boolean grouping and bounded evaluation | Bounded query parser implemented and tested |
| Filtered views | Quick/long reads, recent saves, continue reading, recently highlighted | Useful default collections derived from reading history | Observed; unimplemented |
| Article actions | Text-to-speech, reset progress, original URL, copy document URL | Audio controls, explicit restart-reading action, addressable document routes | Partial: speech, reset and navigation implemented; permanent document URLs outstanding |
| Article actions | Public sharing link and print with annotations | Revocable read-only sharing and print layout including notes | Print implemented but unverified; public sharing outstanding |
| Article actions | Edit metadata | Editable title, author, summary, category and source fields without losing annotations | Implemented; snapshot anchors tested; browser reload verification pending |
| Notebook | Highlight-level tags and notes | Separate highlight metadata and searchable notebook | Implemented; global notebook document-note display browser verified |
| PDF | Original-page view, zoom, views control, snapshots, annotations | Preserve original file plus extracted reading text; page-based navigation | Owner-only original-byte storage tested; PDF reader and ingestion outstanding |

The notebook Export control did not expose a menu during this browser pass. Its exact formats remain unverified. No exports, subscriptions, configuration changes, or sharing links were created in the user's Readwise account.

Research continues through document actions, notebook exports, PDF/EPUB reader behavior, workflow modes, keyboard shortcuts, integrations setup, and audio.

## Further settings inspection

The workflow dialog exposes three distinct models: **Triage** (Inbox → Later → Archive), **Shortlist** (Later → Shortlist → Archive), and **Classic** (Later → Archive). This affects capture destination and visible collections, not merely labels.

The [keyboard shortcut catalogue](https://read.readwise.io/preferences/shortcuts) also reveals product capabilities absent from the first screen: undo/redo, command palette, view quick switcher, split views, bulk actions, favorites, bump-to-top, seen/unseen and mark-all-seen, paragraph navigation and highlighting, auto-highlighting, highlight tags, notebook navigation, annotated public versions, annotation copy/download, PDF download/rotation/page jump/snapshot, audio speed/seeking, video transcript auto-scroll, and subscribing to the current document's feed. These are observed command labels; execution and precise semantics remain unverified. They extend C04–C08 and C10 rather than being implicitly excluded.

Transfer parsers/exporters, bounded query evaluation, import preview/apply, and saved-view UI are implemented. Verification remains granular: module and API tests cover transfer; synthetic browser checks cover saved-view creation/opening. Full browser import/export round trips remain outstanding.

### Integration details verified in settings

- **Kindle:** setup requires adding the service sender to Amazon's approved personal-document senders, then saving the target Kindle device email. No address was changed or delivery attempted.
- **Webhooks:** the form requires endpoint testing before creation. Selectable events cover highlight creation/tag addition, document creation (all/feed/non-feed), tag changes, finished reading, archived, moved to Later/Inbox, and shortlisted. Signing/retry semantics still require documentation verification. No endpoint was tested or webhook created.
- **MCP:** the [official setup page](https://readwise.io/mcp) documents a remote HTTP server and tools for hybrid document/highlight search, filtered listing, creating documents/highlights, full Markdown document retrieval, bulk moves/metadata edits (up to 50), tags and notes, daily spaced-repetition review, and asynchronous Markdown ZIP export with status polling. These are documented capabilities, not exercised against the private account.
- **Portability:** full export is therefore also an asynchronous job lifecycle with a status/download result, not just a browser JSON download. The Markdown ZIP format is explicitly documented by the MCP tool catalogue.

### Export integration checkpoint

Authenticated `/api/export?format=json|csv|opml|zip` now serves the matching download, with private no-store responses. Settings exposes all four choices. ZIP contains the JSON snapshot, metadata CSV, and subscriptions OPML. Existing parser/export behavior tests pass; rendered download verification and import persistence remain outstanding. JSON mutations now bound actual received bytes, including chunked requests. Typecheck and 30 tests passed at this checkpoint.

### Twitter integration inspection

The expanded settings expose separate Reader capture controls for single tweets, bookmarks, threads, and Twitter Articles. A separate Readwise section has its own single-tweet/bookmark/thread controls and a “Migrate threads from Readwise” action. This implies independent capture preferences and an explicit historical migration job, beyond a connected/disconnected account flag. Settings were inspected only; no switches or migration actions were changed.

### Evidence discipline

“Implemented” means local code exists, not production readiness. Browser evidence is recorded in `docs/verification/local-workflows.md`; tests cover only the behavior named by each test. Scheduled refresh configuration is not active until deployment. Original-byte storage does not constitute PDF/EPUB reading support. External adapters, offline access, AI and public sharing remain outstanding requirements.

### EPUB implementation checkpoint

EPUB uploads now use the package manifest and spine for reading order, following the [W3C EPUB structure](https://www.w3.org/TR/epub-33/). Uploads are bounded to 4 MB for the current server request path. The original is stored separately and downloadable through an authenticated endpoint; repeat upload returns the existing document. Extracted text uses the shared search, notes, highlights and reader navigation. Parser tests cover order, metadata, active content stripping, and invalid references; API tests cover upload/deduplication and exact original bytes. Browser upload verification is still pending.

This is partial book support: embedded images are represented by alternative text, internal links and fixed layouts are not rendered, PDF ingestion is absent, and library archives do not yet bundle original attachments. Those remain delivery work.

### PDF implementation checkpoint

PDF uploads now retain the original and extract text page by page using `pdf-parse`. Extracted pages feed the existing contents navigation, search and text annotations. A separate original-pages link opens the browser PDF viewer; original downloads remain available. Scanned pages explicitly report missing selectable text; OCR and page-coordinate annotations are not implemented. Limits are 4 MB, 500 pages, and 2 million extracted characters. A 30-second between-page check bounds further extraction work, but is not a hard interrupt within a single parser call.

Synthetic parser tests verify text extraction, exact DOM-text offsets, unchanged input bytes and malformed-file rejection. The production build passed with the PDF dependency. Browser PDF upload/viewing remains unverified. Snapshot imports now explicitly warn that original attachments are absent; complete attachment backup/restore is still outstanding.

### Original-file archive checkpoint

ZIP exports now include `originals.json` plus content-addressed original files. Import validates MIME metadata, presence, size and SHA-256 before restoring file references. Original bytes are persisted under the importing account before the library snapshot is applied. Preview and completion reports show original-file counts. Missing originals in standalone JSON snapshots still produce an explicit warning.

A separate-library round-trip test proves exact-byte recovery and document linkage; corruption is rejected. Twelve targeted transfer/API tests and typecheck passed. Browser download/upload and deployed payload limits remain unverified. Files and library JSON are not yet committed in a single transaction: a failed library apply can leave an unreferenced original, though retry is deduplicated. Archives remain bounded to 20 MB compressed and 50 MB expanded; larger libraries need asynchronous/direct-storage export and import.

### EPUB content update

Embedded PNG/JPEG/GIF/WebP images now render through owner-authenticated original-resource endpoints. Chapter links and generated heading targets survive native ZIP backup restore. Browser upload, image decoding and forward/backward navigation verified with synthetic books; 62 tests and production build pass. Earlier image/link limitations above are superseded. SVG, fixed-layout fidelity, page-specific annotations and uploads larger than 4 MB remain delivery work. PDF ingestion and original-file ZIP backup are also implemented and verified in local-workflows.md.
