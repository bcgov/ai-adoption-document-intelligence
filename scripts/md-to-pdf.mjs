#!/usr/bin/env node
/**
 * Render a markdown file to PDF.
 *
 *   node scripts/md-to-pdf.mjs <input.md> [output.pdf]
 *
 * Uses `marked` for markdown → HTML and Chromium's own print engine (via the
 * already-installed Playwright) for HTML → PDF, so there is no new dependency
 * and no LaTeX toolchain. Relative image paths resolve because the page is
 * loaded from a `file://` URL inside the markdown file's own directory.
 */

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { marked } from "marked";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg) {
  console.error("usage: node scripts/md-to-pdf.mjs <input.md> [output.pdf]");
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(
  outputArg ?? join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.pdf`),
);
const docTitle = basename(inputPath, extname(inputPath));

const CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font: 10.5pt/1.55 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: #1c1c1e; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.4em 0 .5em; break-after: avoid; text-wrap: balance; }
  h1 { font-size: 22pt; letter-spacing: -.015em; margin-top: 0; }
  h2 { font-size: 15pt; letter-spacing: -.01em; padding-bottom: .25em; border-bottom: 1px solid #dcdde0; }
  h3 { font-size: 12pt; }
  h4 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: .06em; color: #55565a; }
  /* A stop heading and its screenshot must not be split across a page. */
  h2 + p, h3 + p, h2 + p + p { break-inside: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 1.35em; }
  li { margin: .22em 0; }
  a { color: #12508f; text-decoration: none; }
  code {
    font-family: "Cascadia Mono", Consolas, "Liberation Mono", monospace;
    font-size: .88em; background: #f2f3f5; padding: .1em .32em; border-radius: 3px;
  }
  pre {
    background: #f7f8fa; border: 1px solid #e3e5e9; border-radius: 5px;
    padding: .75em .9em; overflow-x: auto; break-inside: avoid; font-size: 8.5pt; line-height: 1.45;
  }
  pre code { background: none; padding: 0; font-size: inherit; }
  blockquote {
    margin: 1em 0; padding: .6em .95em; border-left: 3px solid #9db8d4;
    background: #f4f7fb; break-inside: avoid;
  }
  blockquote p:first-child { margin-top: 0; }
  blockquote p:last-child { margin-bottom: 0; }
  table {
    border-collapse: collapse; width: 100%; margin: 1em 0;
    font-size: 9.5pt; break-inside: avoid;
  }
  th, td { border: 1px solid #dcdde0; padding: .42em .6em; text-align: left; vertical-align: top; }
  th { background: #f2f3f5; font-weight: 600; }
  img {
    max-width: 100%; height: auto; display: block; margin: .9em 0;
    border: 1px solid #dcdde0; border-radius: 4px; break-inside: avoid;
  }
  hr { border: 0; border-top: 1px solid #dcdde0; margin: 1.8em 0; }
  strong { font-weight: 650; }
`;

/**
 * Headless Chromium here has 89 fonts and none of them covers emoji, so an
 * emoji renders as a tofu box in the PDF — silently, and only in the PDF.
 * Substitute the ones our docs use for glyphs the installed fonts do have.
 * The markdown source keeps its emoji: it is correct on GitHub and in the app,
 * where the same characters appear in real workflow names.
 */
const GLYPH_FALLBACKS = [
  [/⏱️?\s*/g, ""], // ⏱ stopwatch — no substitute renders; the duration reads fine alone
  [/☁️?/g, "&#x2295;"], // ☁ cloud (needs the engine) → ⊕
  [/\u{1F3AF}️?/gu, "&#x25C6;"], // 🎯 demo marker → ◆
  [/⛶️?/g, "[fit]"], // ⛶ fit-view control — no near glyph, name it
];

let markdown = readFileSync(inputPath, "utf8");
for (const [pattern, replacement] of GLYPH_FALLBACKS) {
  markdown = markdown.replace(pattern, replacement);
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${docTitle}</title><style>${CSS}</style></head>
<body>${marked.parse(markdown)}</body></html>`;

// Written next to the markdown so relative image srcs resolve unchanged.
const tmpHtml = join(dirname(inputPath), `.md-to-pdf-${process.pid}.html`);
writeFileSync(tmpHtml, html);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#87888c;padding:0 16mm;' +
      'display:flex;justify-content:space-between;">' +
      `<span>${docTitle}</span><span class="pageNumber"></span></div>`,
    margin: { top: "18mm", right: "16mm", bottom: "20mm", left: "16mm" },
  });
} finally {
  await browser.close();
  unlinkSync(tmpHtml);
}

console.log(`${inputPath} → ${outputPath}`);
