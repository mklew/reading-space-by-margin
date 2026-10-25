# Storage and concurrency

The production database is PostgreSQL. Development can use disk-backed PGlite; tests create isolated in-memory or temporary databases.

## SQL tables

| Table | Purpose |
| --- | --- |
| `accounts` | Username, salted password hash and the single-account constraint |
| `tokens` | Hashed token, owner, kind and expiration |
| `attempts` | Persisted setup/login attempt counters |
| `libraries` | One JSONB library aggregate per account |
| `attachments` | Original bytes and metadata, keyed by owner and content identifier |
| `job_leases` | Expiring ownership of scheduled work |

Schema tables initialize on first use. The deployment database role therefore needs schema-creation permission. There is no independent migration service in the current design.

## Library aggregate

The JSONB record contains documents, highlights, feeds, feed entries, saved views and preferences. Documents carry metadata, sanitized HTML, plain text, progress, folder, tags and a revision. Highlight offsets refer to the stored text.

Mutations lock the account’s library row, read the aggregate, apply a change and write it back. URL and feed-entry deduplication are application invariants inside this transaction, not normalized SQL unique constraints.

## Conflicts and progress

An expected revision protects metadata and annotation edits. Stale writes receive a conflict. Bulk operations validate revisions before applying their changes. Reading progress does not decrease implicitly; an explicit reset changes the revision so delayed progress updates cannot undo the reset.

Preferences have their own revision. Restoring preferences from a backup is opt-in.

## Original files

Original PDF/EPUB bytes are content-addressed by SHA-256 and scoped to the owner. The same bytes can be deduplicated within an account. Downloads require authenticated ownership checks.

Importing originals and restoring the library are separate operations. If the aggregate write fails, an original can remain unreferenced. Transactional file restoration and cleanup remain future work.

## Scaling implications

Every library mutation rewrites a complete aggregate, and reads load it together. Larger libraries increase payload size, memory use and contention. Archives are also assembled in memory. Normalized indexing, background transfer jobs and object storage should be driven by measurement rather than treated as already implemented.
