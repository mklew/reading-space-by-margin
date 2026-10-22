# EPUB images and chapter navigation

The parser currently replaces images with text and strips link targets. Reader also replaces heading IDs, and native snapshot import strips IDs and book-relative links. All three boundaries must share one HTML contract.

## Selected design

Serve validated raster images derived from the already stored, owner-scoped EPUB original. The alternative, separately materialized image attachments, adds asset lifecycle and restore state without a current need. Derivation preserves the existing original-only backup representation. The tradeoff is bounded ZIP decompression per image request.

Caller contract:

- `parseEpub(bytes: Buffer): Article & { category: 'epub' }` remains unchanged. It computes the original SHA256 and embeds same-origin `/api/files/<sha>/resources/<resource-key>` URLs.
- `readEpubImage(bytes: Buffer, resourceKey: string): { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' } | null` validates declared MIME, signature and bounded size. The resource key derives from the normalized archive path, never exposes raw traversal paths.
- Authenticated resource route retrieves an owned EPUB original before extraction. Exact image MIME, nosniff, private cache policy.

Build all chapter targets before rewriting links. Deterministic book-prefixed IDs disambiguate duplicate chapter-local IDs. Reader preserves generated IDs and scrolls valid internal links within the document. Snapshot import preserves only validated generated IDs, fragment links and asset URLs tied to the restored EPUB attachment hash. Standalone JSON without the original loses image URLs with a warning, retaining text and annotations.

No automatic reparsing of existing documents: their placeholder text determines saved highlight offsets. New text is derived from final sanitized HTML. Image loading never changes text nodes.

## Required verification

Two chapters, repeated local IDs, raster image, encoded paths, internal links and highlight offsets survive ZIP restore. Authenticated image access succeeds, unauthenticated or cross-owner access fails. SVG and external images remain inert. Observe chapter navigation and image rendering in browser.

Status: design accepted under autonomous user authorization; implemented and verified. Read-only architecture review completed. Backup size guard fixed separately; 62 tests, typecheck and production build pass.
