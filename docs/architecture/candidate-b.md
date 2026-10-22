# Reader architecture candidate B: paired private library with document storage

## Problem

Reader needs to gather material from the web and phone, refresh feeds, and preserve private reading state across devices. A relational account model would add account lifecycle and identity-provider setup before the core library is useful. This candidate treats the library itself as the identity boundary: one owner device creates a private library, and other devices join through an expiring pairing grant. Content and state live in one document per item in a document database, so an item mutation is a single atomic write and feed captures can use unique indexes for deduplication. The Vercel project currently has no connected storage or auth resource, so the architecture is feasible but unprovisioned.

## Usage (caller's view)

The browser app uses one domain API. Pages do not know MongoDB, request payloads, or credential hashes.

```ts
const library = await reader.openLibrary(); // Reads paired-device session or starts setup.
const inbox = await library.items.list({ shelf: 'inbox', after: cursor });
const article = await library.capture.url('https://example.com/story');
await library.items.move(article.id, 'later');
```

A phone joins the same library by scanning the QR code displayed by an already-paired device. The phone receives its own revocable device grant; it does not copy the other device's cookie.

```ts
const ticket = await library.devices.createPairingTicket();
// UI renders ticket.qrPayload; another device scans it and opens /pair.
await library.devices.approve(ticket.id);
```

A feed refresh and a note save are ordinary domain operations. Repeating either with the same operation ID does not create duplicate documents or notes.

```ts
await library.feeds.refresh(feedId, { operationId });
await library.annotations.save({ itemId, annotationId, text, operationId });
```

## Shape

### Data structures

- `LibraryId` is a random, non-secret locator. Its unpredictability is not an access control.
- `DeviceGrant` records a hash of a random 256-bit device credential, its library, creation time, last use, and revocation time. The raw credential is only returned once and stored in a Secure, HttpOnly, SameSite cookie.
- `PairingTicket` is a random one-use secret with a two-minute expiry, bound to a library and created by an authorized device. The server stores only its hash. QR payloads carry the ticket secret and app URL. Pairing creates a separate device credential and consumes the ticket atomically.
- `LibraryItem` is one MongoDB document per canonical URL or imported text. It embeds extracted article content, source metadata, shelf, reading progress, tags, reading preferences override, and annotations. Feed entries use the same item shape with `origin.kind = 'feed'`; feed subscriptions are separate documents. The feed inbox is a query over feed-origin items and never mixes into the saved-item Inbox.
- `CaptureKey` is `(libraryId, canonicalUrl)`, backed by a unique compound index. This makes retries and feed refreshes converge on one item. Manual text receives a generated stable source key.
- `AnnotationId` is stable across retries. Notes and highlights are typed variants in an embedded annotation map keyed by ID. Updating or deleting one annotation is an atomic path update on the owning item.
- `OperationId` is supplied for network retries. Capture uses upsert with `$setOnInsert`; other commands set target state, so replaying them is idempotent. A request that makes a relative change must carry the expected item revision and gets a conflict response if stale.

### Call flow and modules

`app/` owns routes and page composition. `domain/` owns parsed domain types and pure transitions. `services/` owns capture, feed parsing, and item workflows. `infra/mongo/` owns collection schemas, indexes, atomic writes, and cursor mapping. `auth/` owns session parsing, grant checks, pairing tickets, and revocation. `routes/api/` parses external inputs, authenticates once, calls domain services, and serializes responses. No page talks to MongoDB.

| Module | Owns | Public boundary |
| --- | --- | --- |
| `domain/library.ts` | Branded IDs, library/item/feed/annotation states, validation from `unknown` | `parseLibraryId`, `parseCaptureInput`, `applyItemCommand` |
| `auth/device-grants.ts` | Cookie sessions, grants, one-use tickets, rate limits | `requireDevice(request)`, `createPairingTicket(device)`, `consumePairingTicket(ticket)` |
| `services/capture.ts` | URL extraction, manual capture normalization, canonicalization, metadata cleanup | `captureUrl(device, url, operationId)`, `captureText(device, input, operationId)` |
| `services/feeds.ts` | RSS/Atom parsing, scheduled refresh, feed inbox semantics, failure state | `subscribeFeed(device, url)`, `refreshFeed(device, feedId, operationId)`, `listFeedInbox(device, cursor)` |
| `services/library.ts` | Shelf transitions, tags, search, progress, trash/restore, annotations | `listItems(device, query)`, `moveItem(device, id, shelf, expectedRevision)`, `saveAnnotation(device, input)` |
| `infra/mongo/repository.ts` | MongoDB reads/writes, unique indexes, atomic revision checks, pagination | `findItems(scope, query)`, `upsertCapturedItem(scope, item)`, `patchItem(scope, id, patch, expectedRevision)` |
| `app/` and `components/` | Clean reader layout, responsive capture/share entry, keyboard/touch actions, reading preferences UI | Calls typed browser client only |

### Type and signature sketch

```ts
type Brand<T, Name extends string> = T & { readonly __brand: Name };
type LibraryId = Brand<string, 'LibraryId'>;
type ItemId = Brand<string, 'ItemId'>;
type FeedId = Brand<string, 'FeedId'>;
type AnnotationId = Brand<string, 'AnnotationId'>;
type OperationId = Brand<string, 'OperationId'>;
type Revision = Brand<number, 'Revision'>;

type DeviceContext = {
  readonly libraryId: LibraryId;
  readonly deviceId: string;
};
type Shelf = 'inbox' | 'later' | 'archive' | 'trash';
type Origin =
  | { readonly kind: 'url'; readonly canonicalUrl: string }
  | { readonly kind: 'manual'; readonly sourceKey: string }
  | { readonly kind: 'feed'; readonly feedId: FeedId; readonly canonicalUrl: string };
type Annotation =
  | { readonly kind: 'highlight'; readonly id: AnnotationId; readonly quote: string; readonly note?: string; readonly createdAt: string }
  | { readonly kind: 'note'; readonly id: AnnotationId; readonly text: string; readonly updatedAt: string };
type LibraryItem = {
  readonly id: ItemId;
  readonly origin: Origin;
  readonly title: string;
  readonly author?: string;
  readonly sourceName: string;
  readonly extractedText: string;
  readonly summary?: string;
  readonly readingMinutes: number;
  readonly shelf: Shelf;
  readonly tags: readonly string[];
  readonly annotations: Readonly<Record<string, Annotation>>;
  readonly progress: { readonly fraction: number; readonly updatedAt: string };
  readonly revision: Revision;
  readonly createdAt: string;
  readonly updatedAt: string;
};
type Page<T> = { readonly values: readonly T[]; readonly nextCursor?: string };
type ItemQuery = { readonly shelf?: Shelf; readonly tag?: string; readonly search?: string; readonly cursor?: string; readonly limit?: number };
type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DomainError };

type ReaderLibrary = {
  capture: {
    url(url: string, operationId: OperationId): Promise<LibraryItem>;
    text(input: { title: string; text: string; sourceName?: string }, operationId: OperationId): Promise<LibraryItem>;
  };
  items: {
    list(query: ItemQuery): Promise<Page<LibraryItem>>;
    move(id: ItemId, shelf: Shelf, expectedRevision?: Revision): Promise<LibraryItem>;
    setProgress(id: ItemId, fraction: number, expectedRevision: Revision): Promise<LibraryItem>;
    search(query: string, cursor?: string): Promise<Page<LibraryItem>>;
  };
  annotations: {
    save(input: { itemId: ItemId; annotation: Annotation; operationId: OperationId }): Promise<LibraryItem>;
    remove(itemId: ItemId, annotationId: AnnotationId, operationId: OperationId): Promise<LibraryItem>;
  };
  feeds: {
    subscribe(url: string): Promise<FeedSubscription>;
    refresh(id: FeedId, operationId: OperationId): Promise<{ inserted: number; updated: number; failedAt?: string }>;
    inbox(query: Omit<ItemQuery, 'shelf'>): Promise<Page<LibraryItem>>;
  };
  devices: {
    createPairingTicket(): Promise<{ id: string; qrPayload: string; expiresAt: string }>;
    revoke(deviceId: string): Promise<void>;
  };
};

async function openLibrary(): Promise<ReaderLibrary>; // Resolves session; routes setup if absent.
async function requireDevice(request: Request): Promise<DeviceContext>; // Rejects absent, invalid, expired, or revoked grants.
async function captureUrl(ctx: DeviceContext, rawUrl: string, op: OperationId): Promise<LibraryItem>; // Fetches and extracts at the server boundary.
async function refreshFeed(ctx: DeviceContext, feed: FeedId, op: OperationId): Promise<RefreshOutcome>;
async function moveItem(ctx: DeviceContext, id: ItemId, shelf: Shelf, revision?: Revision): Promise<LibraryItem>;
async function patchItem(ctx: DeviceContext, id: ItemId, patch: ItemPatch, revision?: Revision): Promise<LibraryItem>; // Scopes every query by libraryId.
```

The browser-facing methods expose domain operations only. HTTP and MongoDB wire types remain inside adapters. Input is parsed at route boundaries, and business transitions are pure functions. This keeps the public surface small while hiding capture parsing, feed deduplication, database keys, and device credential handling, per boundary-discipline and type-system-discipline.

### Storage and authentication

Use a MongoDB Atlas database connected through Vercel Marketplace, subject to project-owner selection and resource setup. Vercel's [Marketplace storage docs](https://vercel.com/docs/marketplace-storage) list MongoDB Atlas as a document-store integration and say integration credentials are injected as environment variables. Use a server-side connection pool and keep all database access in Vercel Functions. The primary indexes are unique `(libraryId, origin.kind, origin.canonicalUrl)` for captured items, `(libraryId, shelf, updatedAt, _id)` for shelf pagination, `(libraryId, tags)` for tag filtering, and unique `(libraryId, feedUrl)` for subscriptions. A text index supports title, source, and extracted text search. Each read and write includes `libraryId`; client-supplied IDs never grant access.

First-device setup creates a library and a random 256-bit device credential. The server returns it once in a Secure, HttpOnly, SameSite cookie and stores only its keyed hash with the grant. A paired phone redeems a single-use, short-lived ticket and receives an independent cookie. Pairing and grant creation are rate limited. Revocation marks one grant invalid and does not invalidate other devices. There is no username/password account or email recovery in this candidate; losing every paired device loses access unless a separately implemented recovery code is added. This is capability authentication, not end-to-end encryption. Server functions can see article text during extraction and database writes.

Vercel's [private Blob storage](https://vercel.com/docs/vercel-blob/private-storage) is a credible alternative for large immutable article bodies or media. Keep metadata and item state in the document store, and only add Blob after large-body costs justify a second persistence surface. Blob is private and routed through authenticated functions. Vercel documents that overwrites/deletions may take up to 60 seconds to propagate, so immutable versioned paths are safer ([Blob guide](https://vercel.com/docs/vercel-blob)). Vercel KV is sunset, and new Redis resources use Marketplace integrations ([Redis on Vercel](https://vercel.com/docs/redis)). A Redis Marketplace integration could serve ephemeral queue/rate-limit state but is not the library's source of truth.

### Platform capture path

A normal mobile browser can submit a URL from the share sheet through a PWA share target where supported. iOS does not provide that path as a universal share extension. The guaranteed v1 path is a fast, authenticated `/capture` page with a paste field, paired-device cookie, and an Add to Home Screen PWA shortcut; a user can share/copy a URL then paste it there. A QR pairing flow connects that phone to the same library. Do not label the iOS flow a native share extension. Install native distribution only as a later project.

## Synthesis decision

This is one independent candidate, prepared for comparison. Its defining choice is one indexed document per item behind a paired-library capability, with atomic item updates. It does not assume a connected Vercel project or provision storage.

## Tradeoffs accepted

- We accept a pairing and recovery burden in exchange for a library identity that does not depend on an account provider.
- We accept that the server can read article text in exchange for server-side URL extraction and simple cross-device capture. Capability authentication protects access; it does not provide end-to-end encryption.
- We accept MongoDB Marketplace setup and provider-specific query behavior in exchange for indexed document access and atomic single-item writes.
- We accept a paste-based iOS share path in exchange for an honest, deployable phone workflow without native app distribution.
- We accept basic text search from a MongoDB text index in exchange for deferring a separate search service.
- We accept keeping article bodies in MongoDB at first; large-body offload to private Blob remains optional and adds another storage boundary.

## Alternatives considered

- **Relational user accounts.** This exposes account identity, provider login, user-to-library joins, and account lifecycle to more callers. It hides less pairing complexity than this candidate and requires a connected auth provider. It may be preferable if the product later needs multiple libraries per person, sharing, teams, or email recovery.
- **Private Blob as the whole database.** This hides infrastructure behind a simple object API, but exposes prefix scans, pagination, merge rules, and stale-cache handling to every library query. Mutable shared manifests also require conditional writes. Blob is better as immutable body storage than as the queryable source of truth.
- **Client-side encrypted library.** This reduces server visibility but conflicts with server-side article extraction and feed refresh unless capture moves fully onto a trusted client or uses a more involved encryption handoff. This candidate makes no E2EE claim.

## Implementation reconciliation

No implementation has started. No Vercel store or auth service has been provisioned. A future implementation must preserve the usage contract, per-library query scoping, unique URL deduplication, and independent revocable device grants. A product decision about recovery codes can be made before first-device onboarding is built.

## Open questions and risks

- Should the owner accept losing access when all paired devices are lost, or should onboarding require a recovery code?
- Should the deployment accept server-side access to captured article text, or is client-side encryption a product requirement that changes extraction and feeds?
- Which Vercel project and team should own the Marketplace database and billing? No connected project or team was available during this sketch.
- MongoDB text search is suitable for a personal library but may not provide the desired language-aware search quality; this needs product verification after implementation.

## Next implementation step

Confirm the library recovery policy and select the Vercel project, then scaffold domain types and the document repository against a local or explicitly provisioned MongoDB-compatible test database.
