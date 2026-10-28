// Packs the demo build (dist-demo/) into one HTML page for a Claude artifact: styles and the single
// script go inline, and the document wrapper is left out because the artifact host adds its own.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../dist-demo');
const html = fs.readFileSync(path.join(dir, 'demo.html'), 'utf8');
const asset = (href) => fs.readFileSync(path.join(dir, href), 'utf8');

// <link rel="stylesheet" crossorigin href="./assets/demo-AbC.css"> → its href.
const cssHrefs = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
// <script type="module" crossorigin src="./assets/demo-AbC.js"></script> → its src.
const jsSrcs = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(
  (m) => m[1],
);
const title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '<title>MorniHosting Demo</title>';

// Text inside an inline script must not close the tag or open an HTML comment.
const safeScript = (code) => code.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');

const page = [
  title,
  ...cssHrefs.map((href) => `<style>${asset(href)}</style>`),
  '<div id="root"></div>',
  ...jsSrcs.map((src) => `<script type="module">${safeScript(asset(src))}</script>`),
].join('\n');

const out = path.join(dir, 'mornihosting-demo.html');
fs.writeFileSync(out, page);
console.log(
  `${out}: ${(page.length / 1024 / 1024).toFixed(2)} MB, ${cssHrefs.length} style, ${jsSrcs.length} script`,
);
