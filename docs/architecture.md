# Reader architecture

## Decision

Use candidate A, a Next.js application with server-owned Postgres data and cookie sessions. The independent gpt-6-astra judge scored A 20/25 and B 13/25 across capture outcomes, privacy, concurrency, deployment feasibility, and maintainability. The coordinator agrees. Candidate B left feed-to-library transitions and URL uniqueness ambiguous.

Take stable annotation identifiers and explicit revision checks from candidate B. Do not add device pairing as a second authentication system. The server can read extracted article text. This is access-controlled storage, not end-to-end encryption.

## Data shape

A user owns documents, feeds, feed entries, highlights, sessions, and preferences. A document holds an immutable sanitized article snapshot, plain text, source metadata, a folder, tags, note, and reading progress. Feed entries have their own new/saved/dismissed lifecycle. The current implementation checks document URLs and feed-entry identities inside a per-account transaction holding the library row lock. These are application invariants, not normalized SQL unique constraints.

## Implemented storage deviation

The initial candidate proposed normalized document/feed/highlight tables. The implementation currently stores a complete Library aggregate in one JSONB row per account, locking and rewriting it for mutations. Accounts, tokens, login attempts, job leases and original-file bytea records have separate tables. This simplifies atomic personal-library edits but means all documents and annotations are loaded together and writes contend at account level. It is a material deviation requiring collection-size measurements and a migration plan; it must not be described as the normalized candidate having been fully implemented.

Originals are content-addressed SHA-256 files scoped by owner. ZIP backups include original bytes and their manifest. Import writes original files before the aggregate transaction, so an unsuccessful aggregate import can leave unreferenced files. Normalized indexing, transactional file restoration and cleanup remain outstanding.

## Interfaces

Capture accepts a public URL or manual text and returns a saved document. The network boundary owns URL safety, bounded retrieval, article extraction, and sanitation. Feed parsing returns normalized entries. The library owns all user-scoped SQL and atomic mutations. HTTP routes validate requests and session or capture-token scope. React components consume typed domain records.

Document notes and tags require the document revision. Highlight note/tag edits and removal also require an expected revision. Legacy highlights default to revision zero; stale requests receive a conflict. The editor retains its draft and offers an explicit reload of current values. Stale edits return conflict rather than replacing newer data. Highlights use stable IDs and offsets into the stored text. Progress updates never decrease implicitly. Feed refresh merges entries into the locked library aggregate and exposes manual and scheduled endpoints. URL extraction completes before an insert; duplicate captures converge under the library row lock without overwriting snapshots.

## Local and production storage

Local development uses disk-backed PGlite, with the same PostgreSQL SQL schema used through the postgres driver in production. Tests use isolated in-memory PGlite databases. Production requires DATABASE_URL and does not fall back to local filesystem storage. Local development must remain possible while Vercel project creation is awaiting approval. This intentionally limits the bootstrap skill's linked-resource ordering to shared cloud resources.

The first personal account requires an environment setup secret. Password hashes use scrypt. Sessions and capture tokens are random opaque secrets stored hashed. HttpOnly cookies authenticate browser requests. Origin checks protect browser mutations. Capture tokens can only add a URL. Setup and login need persisted attempt limits.

## Deployment gate

The connected Vercel account currently lists no teams or projects. Automatic approval review rejected creation of the proposed margin-reader project due to missing explicit project name and account approval. No project or database was created. Prepare and verify the implementation locally before requesting approval for the concrete target. Do not bypass the rejection through the CLI.

## Verification

Run behavior tests for safe fetch, extraction, feed parsing, persistence, ownership, deduplication, optimistic concurrency, session/token scope, and highlight anchors. Drive desktop and mobile browser workflows. Independently review the code and decision trail. After approval, deploy to Vercel and repeat critical journeys against the actual deployment. A local build does not prove deployment or phone integration.
