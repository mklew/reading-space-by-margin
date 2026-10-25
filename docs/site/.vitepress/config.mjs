import { defineConfig } from 'vitepress';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const base = process.env.DOCS_BASE || '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('DOCS_BASE must start and end with /.');

const group = (text, items) => ({ text, items: items.map(([text, link]) => ({ text, link })) });
export default defineConfig({
  title: 'Margin',
  titleTemplate: ':title · Margin handbook',
  description: 'A public handbook for reading, running and building Margin.',
  lang: 'en-US',
  base,
  srcDir: 'pages',
  cleanUrls: true,
  head: [['link', { rel: 'icon', href: `${base}icon.svg` }]],
  themeConfig: {
    logo: '/icon.svg',
    siteTitle: 'Margin / Handbook',
    nav: [
      { text: 'Read', link: '/guide/product' },
      { text: 'Run', link: '/guide/quick-start' },
      { text: 'Build', link: '/architecture/overview' },
      { text: 'For agents', link: '/development/agents' }
    ],
    sidebar: [
      group('Start here', [['The handbook', '/'], ['Product overview', '/guide/product'], ['Quick start', '/guide/quick-start'], ['Feature guide', '/guide/features']]),
      group('Use Margin', [['Reading workflow', '/guide/reading'], ['Import & export', '/guide/import-export'], ['Saved-view queries', '/reference/queries']]),
      group('Run & connect', [['Deployment', '/guide/deployment'], ['Scheduled feeds', '/reference/scheduled-feeds'], ['CLI', '/reference/cli'], ['MCP', '/reference/mcp'], ['HTTP API', '/reference/api'], ['Security policy', '/reference/security']]),
      group('Understand & build', [['Architecture', '/architecture/overview'], ['Storage & concurrency', '/architecture/storage'], ['Security boundaries', '/architecture/security'], ['Development', '/development/contributing'], ['Testing', '/development/testing'], ['Agent guide', '/development/agents'], ['Documentation site', '/development/documentation']])
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/mklew/reading-space-by-margin' }],
    editLink: { pattern: 'https://github.com/mklew/reading-space-by-margin/edit/main/docs/site/pages/:path', text: 'Edit this page on GitHub' },
    docFooter: { prev: 'Previous page', next: 'Next page' }
  },
  async buildEnd(site) {
    const source = join(site.root, 'pages');
    async function markdownFiles(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(entries.filter(e => e.name !== 'public').map(e => e.isDirectory() ? markdownFiles(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));
      return files.flat().sort();
    }
    const index = ['# Margin handbook', '', '> Product, user and developer documentation for a self-hosted personal reader.', '', '## Pages', ''];
    const full = ['# Margin handbook — complete Markdown', ''];
    for (const file of await markdownFiles(source)) {
      const path = relative(source, file).split('\\').join('/');
      const text = (await readFile(file, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, '')
        .replace(/\]\(\/([^)]*)\)/g, `](${base}$1)`)
        .replace(/\]\((llms(?:-full)?\.txt)\)/g, `](${base}$1)`);
      const title = text.match(/^# (.+)$/m)?.[1] || path;
      const output = join(site.outDir, 'markdown', path);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, text);
      index.push(`- [${title}](${base}markdown/${path})`);
      full.push(`<!-- Source: ${path} -->`, text, '\n---\n');
    }
    await writeFile(join(site.outDir, 'llms.txt'), index.join('\n') + '\n');
    await writeFile(join(site.outDir, 'llms-full.txt'), full.join('\n'));
  }
});
