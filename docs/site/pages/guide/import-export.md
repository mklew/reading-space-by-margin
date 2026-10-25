# Import, export and back up

Choose a format based on what you want to preserve. A reading list and a recoverable library backup are different artifacts.

## Export formats

| Format | Contents | Best use |
| --- | --- | --- |
| JSON | Library snapshot with document content and annotations | Inspecting or transferring library state |
| CSV | Document metadata | Spreadsheets and reading-list migration |
| OPML | Feed subscriptions | Moving subscriptions between readers |
| ZIP | Snapshot, metadata, subscriptions and original files | Full library backup |

Use Settings to download an export. Keep backups private: they can contain full article text, personal notes and uploaded books.

## Import safely

1. Open the import control in Settings and select a supported file.
2. Preview the parsed contents and warnings.
3. Review whether preferences should also be restored.
4. Apply the import and inspect the added and skipped counts.

Supported paths include Margin snapshots/archives, CSV, OPML, bookmarks HTML, text and recognized reading-service formats. Support for a recognized format is not a promise that every provider export variant works.

Readwise CSV mapping preserves available tags, dates, progress and locations. CSV does not contain missing full text or annotations; URL capture may still depend on the original site being accessible. Unsupported or unavailable sources can produce partial results.

## Originals and deduplication

Uploaded originals are identified by SHA-256 and scoped to the account. ZIP restoration checks originals against the manifest. Repeated imports skip supported existing records instead of blindly duplicating them; review the import report rather than assuming every field has been merged.

JSON alone cannot restore original file bytes. Missing-original handling removes unavailable resource links while preserving annotation text offsets.

## Limits

Upload requests are capped at 4 MB. Archive parsing has separate 20 MB compressed and 50 MB expanded bounds, but a hosting platform or request route can reject a smaller payload before parsing. Archives are assembled in memory.

Original files and the library aggregate are separate writes. A failed library import can leave an unreferenced, deduplicated original. Test restoration into a separate installation and keep provider-level database backups where appropriate.
