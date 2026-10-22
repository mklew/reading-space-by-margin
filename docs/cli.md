# Margin command line

Use Node.js 20 or newer. The CLI has no extra dependencies. Run it from this project folder with `node scripts/margin.mjs`.

Set `MARGIN_URL` to the deployed app origin, such as `https://your-reader.vercel.app`. Obtain tokens in the app's Settings. Set `MARGIN_READ_TOKEN` for library access and `MARGIN_CAPTURE_TOKEN` for saving URLs. Read access and capture access use separate tokens. Keep tokens in your shell environment or secret manager; do not put them in command arguments or commit them.

```sh
node scripts/margin.mjs list --limit 20 --offset 0
node scripts/margin.mjs search 'research' --limit 10
node scripts/margin.mjs read DOCUMENT_ID
node scripts/margin.mjs save https://example.com/article
```

Search matches literal text in titles, authors, article bodies and tags; it does not evaluate saved-view query syntax.

List and search return a JSON page with `documents`, `total`, `limit`, and `offset`. Read returns the document and its highlights. Save returns the capture endpoint's JSON result. Successful commands write JSON to standard output. Errors write a message to standard error and exit with status 1. Use `help` for usage without configuring credentials.

Pagination accepts limits from 1 through 100 and nonnegative offsets. The CLI refuses redirects, credentials embedded in URLs, and remote HTTP connections. Local development permits HTTP on `localhost`, `127.0.0.1`, and `::1`. Requests time out after 15 seconds and responses are limited to 5 MB. Token values are redacted if a server echoes them in a successful response; error response bodies are never printed.
