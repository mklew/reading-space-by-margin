import { zipSync, strToU8 } from 'fflate';

export function epubFixture(overrides: Record<string, string | Uint8Array> = {}): Buffer {
  const files: Record<string, string | Uint8Array> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="Book/package.opf"/></rootfiles></container>',
    'Book/package.opf': '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Illustrated test book</dc:title><dc:creator>Test author</dc:creator></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two%20chapter.xhtml" media-type="application/xhtml+xml"/><item id="picture" href="images/pixel.png" media-type="image/png"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
    'Book/one.xhtml': '<html><body><h1 id="chapter">First chapter</h1><p>Hello illustrated reader.</p><img src="images/pixel.png" alt="Blue pixel"/><a href="two%20chapter.xhtml#chapter">Read second chapter</a></body></html>',
    'Book/two chapter.xhtml': '<html><body><h1 id="chapter">Second chapter</h1><p>The end.</p><a href="one.xhtml#chapter">Back to first chapter</a><a href="one.xhtml">Chapter start</a></body></html>',
    'Book/images/pixel.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    ...overrides,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, typeof value === 'string' ? strToU8(value) : value]))));
}
