# Contributing to Margin

Margin is a personal reader with one account per installation. Keep changes focused on a concrete reading or library workflow.

## Local setup

Follow the [README](README.md#run-locally). Use a separate local database and synthetic documents. Never point tests or exploratory migrations at a personal production library.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/app/` | Next.js entry points and HTTP routes |
| `src/components/` | Library, reader and settings interfaces |
| `src/server/` | Authentication, persistence, capture and document parsing |
| `src/domain.ts` | Shared library records |
| `src/query.ts` | Saved-view query parsing |
| `scripts/` | CLI and stdio MCP adapter |
| `tests/` | Behavior tests and synthetic fixtures |

Read `AGENTS.md` and the relevant installed Next.js guides in `node_modules/next/dist/docs/` before changing framework code. The installed version can differ from familiar Next.js APIs.

## Check a change

```sh
npm run typecheck
npm test
npm run build
```

Some integration tests bind loopback HTTP servers; run them in an environment that permits local sockets. UI changes also need a browser check of the affected flow. Use synthetic fixtures for screenshots, exports and bug reports.

Explain the problem, resulting behavior and validation in a pull request. Preserve account ownership checks, token scopes, revision checks, import bounds and safe URL handling. Update the relevant documentation when behavior changes.

## Keep private data local

Review `git diff --cached` before committing. Never commit environment files, tokens, private keys, database snapshots, personal reading exports or deployment credentials. `.env.example` contains names and placeholders only. See [SECURITY.md](SECURITY.md).
