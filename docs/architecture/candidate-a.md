# Candidate A: server-owned personal library

## Problem

Build a deployable Reader application from an empty repository. Captures from desktop and phone must reach the same private library; subscriptions need a distinct feed inbox; reading state, annotations, and organization must survive browser restarts and device changes. The existing repository has a brief and UI observations, but no application or storage to preserve. This candidate uses a Next.js App Router application on Vercel, with PostgreSQL as the sole source of user data. It does not import the user's Readwise data or display controls for unsupported integrations.

## Usage (caller's view)

The web user signs in on each device, saves a URL or pastes text, and reads the resulting document from Inbox. The iPhone user can use the same mobile `/add` screen, or configure a Shortcuts share action that receives a URL and posts it to the capture endpoint using a revocable, capture-only token. The feed user subscribes once and sees newly polled entries in Feed; moving an entry into the library creates a document in Inbox.

```ts
// src/app/api/captures/route.ts: browser or iOS Shortcut adapter
const actor = await auth.requireCaptureActor(request);
const command = await parseCaptureUrl(request); // validates the wire shape
const result = await capture.saveUrl(actor, command);
return Response.json(result, { status: result.created ? 201 : 200 });

// src/app/api/feeds/[id]/entries/[entryId]/save/route.ts
const viewer = await auth.requireWebActor(request);
const document = await feeds.saveEntry(viewer, feedId, entryId);
return Response.json({ documentId: document.id });

// src/app/api/cron/feeds/route.ts: one protected daily Vercel cron
await auth.requireCron(request);
return Response.json(await feeds.refreshDue({ now: new Date(), budgetMs: 45_000 }));

// src/app/(app)/library/[documentId]/page.tsx
const viewer = await auth.requireWebActorFromCookies();
const document = await library.getDocument(viewer, documentId);
return <Reader document={document} />;
```

These callers know only the authenticated actor, a command, and a result. They do not know SQL, extraction stages, RSS parsing, or transport response shapes.

## Shape

```ts
type UserId = string & { readonly __brand: "UserId" };
type DocumentId = string & { readonly __brand: "DocumentId" };
type FeedId = string & { readonly __brand: "FeedId" };
type EntryId = string & { readonly __brand: "EntryId" };
type WebActor = Readonly<{ kind: "web"; userId: UserId }>;
type CaptureActor = Readonly<{ kind: "capture"; userId: UserId; tokenId: string }>;
type Folder = "inbox" | "later" | "archive" | "trash";
type Source =
  | Readonly<{ kind: "url"; originalUrl: string; canonicalUrl: string }>
  | Readonly<{ kind: "manual" }>;
type ExtractionState = "pending" | "ready" | "needsAttention";
type DocumentBase = Readonly<{
  id: DocumentId; source: Source; folder: Folder;
  title: string; author: string | null; siteName: string | null;
  progress: number; tags: readonly string[];
}>;
type Document = DocumentBase & (
  | Readonly<{ extraction: "ready"; sanitizedHtml: string; plainText: string }>
  | Readonly<{ extraction: "pending" | "needsAttention"; sanitizedHtml: null; plainText: null }>
);
type SaveUrl = Readonly<{ url: string; idempotencyKey?: string }>;
type SaveText = Readonly<{ title: string; text: string }>;
type FeedEntry = Readonly<{
  id: EntryId; feedId: FeedId; title: string; url: string;
  publishedAt: Date | null; summary: string | null; disposition: "new" | "dismissed" | "saved";
}>;
type TextAnchor = Readonly<{
  contentHash: string; start: number; end: number;
  exact: string; prefix: string; suffix: string;
}>;

interface CaptureService {
  saveUrl(actor: WebActor | CaptureActor, input: SaveUrl): Promise<{ id: DocumentId; created: boolean; extraction: ExtractionState }>;
  saveText(actor: WebActor, input: SaveText): Promise<DocumentId>;
  retryExtraction(actor: WebActor, id: DocumentId): Promise<ExtractionState>;
}
interface LibraryService {
  list(actor: WebActor, query: { folder: Folder; search?: string; tag?: string; cursor?: string }): Promise<{ items: readonly Document[]; nextCursor?: string }>;
  getDocument(actor: WebActor, id: DocumentId): Promise<Document>;
  move(actor: WebActor, id: DocumentId, to: Folder): Promise<void>;
  setTags(actor: WebActor, id: DocumentId, tags: readonly string[]): Promise<void>;
  recordProgress(actor: WebActor, id: DocumentId, progress: number): Promise<void>;
  resetProgress(actor: WebActor, id: DocumentId): Promise<void>;
  setPreferences(actor: WebActor, input: ReadingPreferences): Promise<void>;
  addHighlight(actor: WebActor, id: DocumentId, anchor: TextAnchor, note?: string): Promise<string>;
  setDocumentNote(actor: WebActor, id: DocumentId, text: string): Promise<void>;
}
interface FeedService {
  subscribe(actor: WebActor, url: string): Promise<FeedId>;
  listInbox(actor: WebActor, cursor?: string): Promise<{ items: readonly FeedEntry[]; nextCursor?: string }>;
  saveEntry(actor: WebActor, feedId: FeedId, entryId: EntryId): Promise<{ id: DocumentId }>;
  dismissEntry(actor: WebActor, feedId: FeedId, entryId: EntryId): Promise<void>;
  refreshDue(input: { now: Date; budgetMs: number }): Promise<{ checked: number; inserted: number; failed: number }>;
}
type ReadingPreferences = Readonly<{
  theme: "light" | "dark" | "system";
  typeface: "serif" | "sans"; fontScale: number;
  lineHeight: number; measure: "narrow" | "medium" | "wide";
}>;
```

The PostgreSQL schema is organized around `users`, `sessions`, `capture_tokens`, `documents`, `tags`, `document_tags`, `highlights`, `document_notes`, `subscriptions`, `feed_entries`, and `reading_preferences`. Every owned row has `user_id`; every read and mutation scopes by the actor's `user_id` in SQL, including nested feed entry operations. `documents` has a unique `(user_id, canonical_url)` index for URL sources, while manual text has no canonical URL. Recapturing an existing URL returns its document; if it was in Trash, it restores it to Inbox. `feed_entries` has a unique `(subscription_id, external_id)` index; the feed parser derives a stable fallback ID from canonical entry URL when a GUID is absent. Polling updates entry metadata without resetting its disposition. `documents` stores a sanitized extraction snapshot and plain text. Highlights anchor to that snapshot, which is never silently replaced. A Postgres full-text index supports library search; folder, moved time, feed published time, and user ID have matching indexes for dominant lists. Trash is a folder state, so restore is the same `move` operation and hard deletion is a separate, explicit action.

The server validates request shapes, session cookies, capture bearer tokens, cron secrets, URLs, feed XML, and HTML at the adapters. The application service receives domain types. URL fetches reject local/private/reserved IP destinations, resolve DNS at each redirect, limit redirects, bytes, and duration, and sanitize extracted content. A short transaction claims a URL via its unique index; network fetching happens outside the transaction; a final update records either a readable snapshot or `needsAttention`. Stale `pending` rows can be retried. Duplicate capture, repeated Shortcut invocation, and feed polling converge through unique constraints and upserts. Progress uses a monotonic maximum so an older device cannot accidentally erase a newer read position; an explicit reset is needed for rereading.

The one-account bootstrap is guarded by an environment-supplied setup code; afterward, password sign-in creates opaque, hashed, database-backed sessions with secure HttpOnly cookies. There is no email dependency. The settings screen can mint and revoke a random token restricted to `saveUrl`, stored hashed in `capture_tokens` and shown once for the user's Shortcut setup. Browser writes check Origin and CSRF; the Shortcut uses its bearer token. A capture token has no read, feed, annotation, or settings permission. Initial deployment must require both `DATABASE_URL` and setup secret before accepting private data.

Module ownership stays local to the knowledge it protects:

| Module | Owns |
| --- | --- |
| `src/server/auth/` | Passwords, sessions, actor construction, capture-token scope, setup claim |
| `src/server/capture/` | URL safety, canonicalization, fetch, extraction, sanitation, document creation |
| `src/server/library/` | Document lists, folders, tags, search, notes, highlights, progress, preferences |
| `src/server/feeds/` | RSS/Atom parsing, subscriptions, polling leases, entry deduplication and disposition |
| `src/server/db/` | Connection, migrations, private query helpers and schema |
| `src/app/` | Thin Next.js pages and HTTP adapters; responsive Add, Feed, Library, Reader, Settings |

The public server surface is the three services plus actor construction. The modules hide the policies that make capture, organization, and feed polling work; a route should complete one user operation with one service call. The database schema and feed/parser wire shapes remain internal. This is a deep interface with short call chains, per boundary-discipline and minimize-reader-load. The typed actor distinction makes capture-only authorization hard to accidentally bypass, per type-system-discipline. Unique indexes and transactions enforce idempotency, per make-operations-idempotent. One owner for each table family avoids split ownership, per model-the-domain.

## Infrastructure feasibility

Vercel hosts the Next.js app and Node runtime functions. New Postgres storage on Vercel is supplied through Marketplace providers rather than the discontinued Vercel Postgres product; the application needs a pooled PostgreSQL connection string from a selected provider. Marketplace installation and provider tier must be inspected before provisioning, especially because no paid purchase is authorized. The current connected Vercel tools show no existing team or project, so this candidate makes no claim that storage, auth secrets, or a deployment already exist. See [Vercel storage](https://vercel.com/docs/marketplace-storage) and [Postgres on Vercel](https://vercel.com/docs/postgres).

One daily protected cron is viable on Vercel Hobby, but a daily schedule has imprecise timing and Vercel does not retry failed runs. The Feed screen therefore offers a manual refresh and reports the last attempt and failure; the cron processes due subscriptions under a bounded function budget with per-feed leases, so overlapping manual and scheduled runs do not create duplicate entries. Personal-scale capacity must be checked against actual subscription count and provider limits. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The iOS share path uses an Apple Shortcut configured to accept URLs from the share sheet and send a JSON POST through Get Contents of URL. The mobile Add screen remains usable without a Shortcut. The PWA manifest may expose an Android share target as an enhancement, but it is not the iOS contract. See [Apple Shortcuts share input](https://support.apple.com/en-euro/guide/shortcuts/apd7644168e1/ios), [Apple Shortcuts POST action](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/10.0/ios/27), and [MDN share target compatibility](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target).

## Synthesis decision

This is an independent relational candidate for the architect runner panel. The orchestrator should compare it with structurally different candidates before recording a synthesis decision.

## Tradeoffs accepted

- We accept a managed Postgres dependency in exchange for durable, transactional, private cross-device state.
- We accept a one-time Shortcut token setup in exchange for an actual iOS share-sheet intake route without native app distribution or email ingestion.
- We accept daily automatic feed refresh plus user-triggered refresh in exchange for staying within the documented Hobby cron schedule.
- We accept immutable extracted snapshots in exchange for stable highlights and reproducible reading, even when a source page later changes.

## Alternatives considered

- Browser-only IndexedDB exposes synchronization, backup, and conflict policy to every caller and cannot make phone capture land in a desktop library without a separate sync backend. Its apparent storage simplicity yields a shallow public interface.
- A client-owned hosted backend exposes database authorization policy, capture pipeline coordination, and feed refresh to client code. A server-owned domain API hides those decisions behind fewer calls and keeps write authorization in one place.
- A third-party read-later API would make persistent state contingent on a service outside this app and obscure the privacy boundary. It also conflicts with the original-branding and independent-product intent.

## Tests and verification contract

Unit tests cover URL canonicalization, feed GUID fallback, folder transitions, progress conflict behavior, and text anchors against a fixed sanitized snapshot. Integration tests against PostgreSQL cover duplicate simultaneous URL saves, repeated feed polls, cross-user access denial, capture-token scope and revocation, trash/restore, tag/search results, and durable session and document reads after a server restart. Fetch tests use a controlled HTTP server to prove rejection of private IPs and redirect/DNS changes, content-size and timeout handling, malformed RSS/Atom handling, and HTML sanitization. Deployed browser checks must save a public URL, capture from phone into the same account, subscribe and refresh a feed, save an entry, annotate and move a document, reload on another device, and confirm persistence. A separate reviewer should inspect the final diff and live behavior.

## Open questions and risks

- Which no-cost PostgreSQL Marketplace provider and tier can the connected Vercel account actually install without a purchase or billing prompt?
- Does the end-to-end Shortcut POST work on the user's iOS version and chosen browser's share sheet? Test on a real phone before claiming that capture route done.
- What maximum feed count fits the chosen provider and the Hobby function budget? Measure with the deployed cron before promising refresh cadence beyond personal use.

## Next implementation step

Create the database schema, migrations, and actor/auth boundaries first; then wire one complete URL capture and cross-device read path before adding feeds and annotations.
