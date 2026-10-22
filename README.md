# Margin

A personal reading library inspired by Readwise Reader, built with Next.js and TypeScript. This is an active implementation, not a completed Readwise replacement. The [capability inventory](docs/capability-inventory.md) and [backlog](docs/backlog.md) track remaining work and verification.

## Run locally

Use a current Node.js version supported by the installed Next.js and PDF parser packages.

```sh
npm ci
cp .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `SETUP_SECRET` in `.env.local`, then run `npm run dev`. Open http://localhost:3000 and use that setup code to create the single personal account. Passwords and opaque session tokens are hashed before storage. The setup code does not become your account password.

With `DATABASE_URL` unset, development data lives in the PGlite directory named by `READER_DATA_DIR`. Run only one app process against that directory. Production deliberately refuses local file storage and requires PostgreSQL.

## Current functionality

- Save public web articles or pasted text; capture tokens support external shortcuts.
- RSS/Atom subscriptions, folders, refresh and podcast enclosures.
- Library workflows, saved boolean queries, favorites, bulk moves/tags and trash.
- Reader preferences, progress, contents, highlights, notes, global notebook and system speech.
- PDF/EPUB uploads with extracted text and downloadable originals. Scanned PDFs need original-page viewing; OCR is not implemented.
- JSON/CSV/OPML/ZIP transfer, Readwise CSV metadata mapping, import preview, and ZIP originals with SHA-256 validation.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

Tests use isolated databases and synthetic documents. A successful build does not prove deployed persistence, browser workflows, or provider integrations. Browser evidence lives in `docs/verification`.

## Vercel deployment

1. Create/link the intended Vercel project and a durable PostgreSQL database.
2. Configure sensitive environment variables: `DATABASE_URL`, a random `SETUP_SECRET`, and a separately generated `CRON_SECRET`.
3. Set `APP_ORIGIN` to the exact canonical HTTPS app origin. Preview deployments need their own matching origin and isolated database.
4. Deploy the Next.js application. Schema tables initialize on first database use; database credentials therefore need schema-creation permission.
5. Create the personal account through the setup screen. Verify login, capture, annotations, uploads, download, and persistence after redeployment before importing personal material.
6. Verify the daily feed cron using the configured bearer secret. See [scheduled feeds](docs/scheduled-feeds.md).

Never deploy `.env.local`, local PGlite directories, test credentials, or production database dumps. The MVP is deployed on Vercel Hobby with Neon Free. Production login, article import, metadata preservation, and database persistence have been verified.

## Current operational limits

Uploads use a 4 MB request limit. Archive parsing allows 20 MB compressed / 50 MB expanded locally; deployment request and response limits may be lower, so larger transfers need direct object-storage jobs. Archives are assembled in memory. Files and library import are separate writes; a failed import can leave an unreferenced, deduplicated original.

The library currently lives in one JSONB row per account, locked for each mutation; originals use a separate bytea table. This supports the present personal-library implementation but needs measurement and migration for large collections. Offline access, public sharing, complete external integrations, AI, richer book rendering and comprehensive browser verification remain open work.

## Tools

The [CLI guide](docs/cli.md) covers listing, searching, reading and URL capture. Generate a read token under Settings → Tool integrations. Read tokens cannot change documents; URL capture uses a separate capture token. See the [API contract](docs/integration-api.md) for scopes and response formats.

For assistant access, see the [MCP setup guide](docs/mcp.md). The local stdio adapter exposes read-only list, search and document tools.
