# Delivery backlog

All entries are planned unless a verification reference says otherwise. This backlog defines a usable inspired application, not full Readwise service parity.

| ID | Priority | User outcome | Acceptance evidence |
| --- | --- | --- | --- |
| R01 | P0 | Save an internet article by URL | Public HTML is extracted into a readable saved document; duplicate saves return the existing item; invalid, private-network, oversized, and unsupported sources produce useful errors. |
| R02 | P0 | Save from a phone | Responsive capture page accepts a shared URL; installed supported browsers accept a Web Share Target; iOS has documented Shortcut or copy-and-paste capture; the same library is visible on desktop. |
| R03 | P0 | Subscribe to RSS and Atom | Add a valid feed, fetch entries, refresh without duplicates, show failure/retry, unsubscribe without deleting saved articles. |
| R04 | P0 | Triage new feed material | Feed entries stay separate from saved library; saving an entry puts it in Inbox and makes full-text reading available. |
| R05 | P0 | Read without site clutter | Article renders sanitized content with title, source, author, reading time, contents, images, links, and a narrow reading measure on phone and desktop. |
| R06 | P0 | Keep a private persistent library | Authentication or explicit secure pairing isolates libraries; saved items and annotations survive restart and are accessible from another browser session. |
| R07 | P0 | Organize reading | Move documents among Inbox, Later, Archive; trash and restore; counts and empty states reflect changes. |
| R08 | P1 | Find saved material | Search title, body, author, and tags; sort by saved date/title/reading time; filter by tag. |
| R09 | P1 | Remember useful passages | Select text to highlight, add/edit notes, remove a highlight, write a document note; persistence and export are verified. |
| R10 | P1 | Resume comfortably | Reading progress restores; theme, font size, serif/sans choice, and reading width persist. |
| R11 | P1 | Capture material extraction cannot read | Paste text with title and source; disclose extraction failure instead of pretending a link bookmark has article content. |
| R12 | P1 | Use keyboard and small screens | Keyboard navigation and shortcuts ignore form fields; focus is visible; dialogs close with Escape; mobile navigation and reading do not overflow. |
| R13 | P1 | Keep a portable library | Export library and annotations in a documented format; imported data is validated before writing. |
| R14 | P0 | Use the deployed app | Vercel deployment is reachable, storage is durable, secrets stay server-side, and real deployed capture/feed/reading journeys pass. |

## Additional capabilities awaiting deeper investigation

The user explicitly requires a comprehensive product. These are unscoped requirements to investigate, not agreed exclusions or an approved future-only backlog. Implementation status must follow research and dependency analysis.

- Native iOS and Android applications and store distribution.
- Email forwarding and newsletter delivery infrastructure.
- PDF and EPUB parsing with page/chapter-specific annotations.
- YouTube transcription and podcast playback.
- AI summaries and question answering with configured models and billing.
- Browser extension packaging and distribution.
- Advanced saved query language and daily review scheduling.

## Verification order

1. Prove safe URL fetch, extraction, feed parsing, deduplication, and storage semantics.
2. Build capture-to-reader with private persistence.
3. Add feeds and cross-device capture.
4. Add organization, search, notes, highlights, preferences, and export.
5. Review keyboard/mobile behavior and independent security findings.
6. Deploy, rerun critical journeys, and audit every delivery row.

## Expanded delivery units

These units follow the user's comprehensive-product clarification. They extend the earlier core backlog and remain required work or explicit external dependencies. Do not mark the goal complete from R01-R14 alone.

| ID | Outcome | Acceptance |
| --- | --- | --- |
| C01 | Import and export a portable library | JSON/ZIP round trip preserves snapshots, metadata, tags, notes and highlights; CSV and OPML exports work; import preview and per-item report expose failures. |
| C02 | Bring existing reading lists | CSV, OPML, Netscape bookmarks, recognizable Pocket and Omnivore archives import without duplicate items or silent content loss. |
| C03 | Read uploaded documents | PDF and EPUB ingestion preserves original file and provides clean text, navigation and annotations; HTML/Markdown/plain text uploads work; unsafe or oversized files fail clearly. |
| C04 | Save filtered views and triage in bulk | Named/pinned views evaluate boolean filters; bulk tagging/moving works; configurable default view and workflow/auto-advance persist. |
| C05 | Use a full notebook | Highlights have tags/notes; global notebook supports search/filter/export; document metadata is editable. |
| C06 | Listen and revisit | Text-to-speech play/pause/stop/rate/voice, progress reset, previous/next, find in document, print with notes, and keyboard mapping work. |
| C07 | Subscribe without busywork | OPML, feed folders, scheduled refresh, per-source errors, YouTube RSS/channel adapter, podcast RSS audio, and email-source intake are tested. |
| C08 | Connect tools | Scoped API, working CLI and MCP library tools, webhook signing/delivery/retries, capture bookmarklet or browser extension, and revocable credentials are documented and verified. |
| C09 | Use configured reading AI | Provider setup, custom instructions/prompts, document/passage actions and library retrieval chat work with a configured provider; mutations follow explicit tool permissions. |
| C10 | Share and keep offline access | Revocable document sharing, cross-device private data, installable mobile app and cached saved reading work; platform-specific capture limitations are explicit. |
| C11 | Configure delivery integrations | Kindle/email delivery and inbound newsletters have executable adapters and tested authentication; external domains/provider accounts are provisioned or recorded as concrete unmet dependencies. |
| C12 | Complete comprehensive verification | Every capability-inventory row maps to implementation evidence or an unresolved explicit dependency; no future-only bucket silently narrows the user's goal. |

## Implementation checkpoint

These are partial delivery states, not completion claims:

- C01/C02: authenticated JSON/CSV/OPML/ZIP exports; bounded parsers; preview, snapshot apply, and sequential URL capture with failure retries are connected. Parser/storage tests pass. ZIP now includes original files and verifies hashes on restore; separate-library byte/link round-trip tests pass. Browser import/download round trip remains unverified. Opt-in, revision-checked preference restoration and feed-history restoration are implemented and tested.
- C04: query parser, revision-protected saved views, pinned navigation, and atomic bulk move/tag actions implemented. Browser verified saved-view creation/opening and bulk tagging with synthetic data. Workflow modes/default view/auto-advance are implemented; workflow capture routing is tested, while browser verification remains pending.
- C05: metadata editing, highlight tags, searchable global notebook and Markdown export implemented. Store tests protect article text/anchors during metadata edits and archive tests preserve highlight tags. A synthetic document note was verified in the global notebook. Metadata reload persistence and highlight-tag UI still need browser verification.
- C06: explicit progress reset rejects delayed stale writes. Previous/next navigation follows the current filtered/sorted list and remounts reader state per document. System text-to-speech, find and print are implemented. Browser play/pause/stop transitions were verified; audible quality, find and print output remain unverified. Configurable keyboard controls now persist with preferences; duplicate validation, reload persistence, typing guard, next-document and notebook actions are browser verified.
- C03: original-byte storage and authenticated download are implemented and ownership-tested; EPUB upload, spine-ordered text extraction, searchable/annotatable reader content, file deduplication and original download are now connected. API tests cover upload and exact-byte download; browser verification remains pending. Embedded images, internal book links, fixed layout, larger direct-to-storage uploads, and richer PDF page annotations remain outstanding. PDF upload and page-by-page text extraction are connected, with original-page viewing/download links. Parser tests verify text offsets and malformed-file rejection; browser verification is pending.
- C07: feed folders, bounded scheduled refresh with overlapping-job exclusion, and podcast enclosures/playback are implemented. Scheduling is not deployed; durable continuation and email/YouTube adapters remain outstanding.
- R14 and C08–C11: deployment, scheduled ingestion, external integrations, AI, sharing/offline, and document formats still require substantial work. No deployment or comprehensive completion is claimed.

### Tool integration checkpoint

C08 now includes a purpose-scoped library-read API, read-token creation/revocation settings, and executable CLI list/search/read/save commands. Existing capture credentials remain write-only. API/CLI tests cover permissions, pagination, owner isolation, revocation, redirect refusal, timeout and response limits. A CLI subprocess reads actual API handlers backed by an isolated library. MCP, signed webhooks, delivery retries and extension packaging remain outstanding.

### MCP checkpoint

C08 now includes a read-only stdio MCP adapter with list/search/read tools. Protocol subprocess tests and an actual API-handler integration test pass; client installation remains user-specific and is documented in docs/mcp.md. Signed webhook delivery/retries and browser extension remain missing. Independent review found no high-impact issue in API credential separation/ownership; root verified the MCP integration boundaries.

### YouTube checkpoint

C07 now accepts official channel URLs and resolves explicit channel metadata from handle pages. Official feed video descriptions can be saved as video documents with click-to-load embeds, including Shorts. Live NASA refresh and saving/opening a Short were verified in the browser. Feed metadata refresh preserves saved/dismissed state and imported entry IDs. Transcript generation, email adapters, and deployed scheduled refresh remain outstanding. The full suite has 78 passing tests and the production build passes.
