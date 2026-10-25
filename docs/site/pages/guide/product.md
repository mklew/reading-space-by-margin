# What is Margin?

Margin is a personal reading library you run yourself. It brings saved web articles, feed entries, PDFs and EPUBs into a common reading interface, with notes, highlights and reading progress.

## Who it is for

Margin fits someone who wants a single private library across their devices and is comfortable running a web application. A deployment supports one account. It is not a team workspace or a managed hosting service.

## The everyday loop

1. **Collect:** save an article, paste text, upload a document or subscribe to a feed.
2. **Choose:** move items through a workflow, tag topics and pin useful saved views.
3. **Read:** adjust the type and width, find passages and keep your place.
4. **Remember:** highlight a passage, attach a note and revisit it in the notebook.
5. **Keep:** export your library and originals for backup or migration.

## Product vocabulary

| Term | Meaning |
| --- | --- |
| Document | A saved reading item, with content, metadata and progress |
| Folder | A workflow location: Inbox, Later, Shortlist, Archive or Trash |
| Tag | A topic label attached to a document or highlight |
| Saved view | A named query that selects matching documents dynamically |
| Feed entry | An incoming item that can be saved or dismissed independently |
| Highlight | A selected passage anchored to offsets in saved document text |
| Original | The uploaded PDF or EPUB bytes, kept separately from extracted text |

## What “private” means here

Authentication controls library access. The server and database administrator can read stored content; the library is not end-to-end encrypted. Publishing the source code does not publish the library. See [security](../reference/security.md) for credentials, boundaries and backups.

## Project status

The core workflows have automated behavior tests and selected browser checks. Large-library scaling, external provider integrations and richer book rendering still need work. See the [feature guide](features.md) for a current capability summary and the [verification guide](../development/testing.md) for what passing checks prove.
