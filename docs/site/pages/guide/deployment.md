# Deploying Margin

Margin runs as a Next.js Node application. Production requires durable PostgreSQL; the local PGlite fallback is disabled in production.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Production PostgreSQL connection string; use TLS and the provider's recommended pooled endpoint |
| `APP_ORIGIN` | Exact canonical origin, such as `https://reader.example.com`, without a path |
| `SETUP_SECRET` | Random secret required to create the single account |
| `CRON_SECRET` | Separate random bearer secret for scheduled feed refresh |
| `READER_DATA_DIR` | Local PGlite directory when `DATABASE_URL` is unset; defaults/configuration are for development |

Generate each secret independently:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store the result in your hosting provider's secret settings. Never paste actual credentials into source files, issue reports or screenshots.

## Vercel setup

1. Import the repository as a Next.js project and connect a durable PostgreSQL database.
2. Set the production variables above. Use a separate database and matching `APP_ORIGIN` for previews.
3. Deploy. The database user needs permission to create schema tables on first use.
4. Open the canonical URL and create the account with the setup secret. Choose a separate account password of at least 12 characters.
5. Verify sign-in, article capture, a highlight, PDF/EPUB upload and original download with synthetic data.
6. Redeploy and verify that those records persist before importing personal material.

`vercel.json` schedules `/api/cron/feeds` at `0 6 * * *` (06:00 UTC). Confirm that the deployment platform enables the schedule and supplies the configured bearer secret. See [scheduled feeds](../reference/scheduled-feeds.md). A successful build alone does not verify a running cron or durable storage.

## Backups and limits

Use Settings to export a full ZIP archive, including original files. JSON snapshots contain library state but are not a substitute for an archive containing originals. Keep backups private and test restoration into a separate installation. Retain provider-level database backups as appropriate for your installation.

Uploads have a 4 MB request limit. Archive parsing has separate bounds, and hosting request limits can be lower than parser limits. Archives are assembled in memory. Large libraries need measurement: each account's library is currently a single JSONB aggregate, while originals occupy a separate bytea table.

## Troubleshooting

- **Production storage error:** verify `DATABASE_URL`, database connectivity and schema permissions.
- **Rejected browser mutations:** check that `APP_ORIGIN` exactly matches the browser origin.
- **Local database lock:** run only one app process against a PGlite directory.
- **Missing feed updates:** check the cron configuration and secret, then try manual refresh.
- **PDF rendering or parsing errors after deployment:** preserve the native canvas and PDF worker tracing configuration in `next.config.ts`.
