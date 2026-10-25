# Develop Margin

Start with [local setup](../guide/quick-start.md). Use synthetic content and a separate development database. The public repository contains the application and this documentation site.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/app/` | Next.js page entry points and HTTP routes |
| `src/components/` | Interactive library and reader interfaces |
| `src/server/` | Authentication, capture, parsing and persistence |
| `src/domain.ts` | Shared domain records |
| `src/query.ts` | Saved-view expression parsing and evaluation |
| `src/workflow.ts` | Capture destination and folder visibility |
| `src/keyboard.ts` | Shortcut defaults and validation |
| `scripts/` | CLI and MCP adapter |
| `tests/` | Behavior tests and synthetic fixtures |
| `docs/site/pages/` | Public handbook sources |

## Before changing the framework

Read the repository’s `AGENTS.md` and the relevant guides in `node_modules/next/dist/docs/`. This project’s installed Next.js version can differ from familiar APIs. Follow the installed documentation and deprecation notices.

## Validate changes

```sh
npm run typecheck
npm test
npm run build
```

For docs changes:

```sh
npm --prefix docs/site ci
npm run docs:build
npm run docs:preview
```

UI changes need a browser check of the affected flow. Keep tests focused on observable behavior and security boundaries. See [testing](testing.md).

## Reviewable contributions

Describe the user-visible problem, the resulting behavior and the checks you ran. Preserve ownership checks, token scopes, revision handling, URL safety and import bounds. Update this handbook when the public behavior changes.

Never commit secrets, local databases, private exports or production screenshots. Follow the [security policy](../reference/security.md).
