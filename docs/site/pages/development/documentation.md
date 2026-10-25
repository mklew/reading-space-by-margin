# Work on this handbook

The public site uses stable VitePress with its own dependency manifest and lockfile in `docs/site/`. A pinned Vite 6.4.5 override replaces the older Vite dependency bundled by VitePress 1.6.4 to address development-server advisories; recheck build and preview compatibility when upgrading either package. Its source directory is `docs/site/pages/`. Historical notes elsewhere in `docs/` are not scanned or published.

## Run and build

From the repository root:

```sh
npm --prefix docs/site ci
npm run docs:dev
npm run docs:build
npm run docs:preview
```

VitePress provides navigation, local search, heading links, theme switching and a responsive sidebar. The theme extends Margin’s serif headings and muted green palette.

## Add a page

Write ordinary Markdown under `pages/`, add its link to `.vitepress/config.mjs`, and link it from a related page. Use relative Markdown links for internal destinations. Keep headings descriptive, show usable examples and distinguish implemented behavior from limitations.

The build generates raw Markdown and `llms.txt` / `llms-full.txt` directly from these sources. Never copy private notes into `pages/` or `pages/public/`; the latter is copied to the build output.

## Publish as a static site

```sh
npm run docs:build
```

Publish only `docs/site/.vitepress/dist/`. No application database, setup secret or account is required for the static site.

For a GitHub Pages project URL, build with its repository prefix:

```sh
DOCS_BASE=/reading-space-by-margin/ npm run docs:build
```

For a custom domain rooted at `/`, omit `DOCS_BASE`. Preview with the same base path that was used for the build. Raw Markdown links and the machine-readable index use the configured base too.

This repository does not automatically publish the site. Configure a static hosting provider or GitHub Pages deployment separately when you are ready.

VitePress behavior and configuration are documented in the [official guide](https://vitepress.dev/guide/getting-started) and [deployment reference](https://vitepress.dev/guide/deploy).
