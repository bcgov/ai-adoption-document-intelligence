#!/usr/bin/env node
/**
 * Render markdown files to PDF using a headless browser (Edge on Windows,
 * Chrome/Chromium on macOS or Linux).
 *
 * Usage:
 *   node md-to-pdf.js <input.md> [<input2.md> ...] [--out-dir <dir>] [--browser <path>]
 *
 * Examples:
 *   # Convert one file, PDF lands next to the source.
 *   node md-to-pdf.js report.md
 *
 *   # Convert several files, PDFs go to ./output (created if missing).
 *   node md-to-pdf.js a.md b.md c.md --out-dir ./output
 *
 *   # Force a specific browser.
 *   node md-to-pdf.js report.md --browser "C:\Program Files\Google\Chrome\Application\chrome.exe"
 *
 * Notes:
 *   - Image references in the markdown are resolved relative to the source
 *     file (a temporary HTML file is written next to it during rendering and
 *     deleted afterwards).
 *   - Run `npm install` in this folder before first use to fetch the
 *     `marked` dependency.
 *   - On Windows the script auto-detects Microsoft Edge in the standard
 *     install location, then Chrome.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const child_process = require("node:child_process");

let marked;
try {
  ({ marked } = require("marked"));
} catch (err) {
  console.error(
    `Failed to load 'marked'. Run 'npm install' in this folder first.\n` +
      `(${err.message})`,
  );
  process.exit(1);
}
marked.setOptions({ gfm: true, breaks: false });

// ---------------------------------------------------------------------------
// Argument parsing.
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const inputs = [];
let outDir = null;
let browserOverride = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out-dir") {
    outDir = args[++i];
  } else if (a.startsWith("--out-dir=")) {
    outDir = a.slice("--out-dir=".length);
  } else if (a === "--browser") {
    browserOverride = args[++i];
  } else if (a.startsWith("--browser=")) {
    browserOverride = a.slice("--browser=".length);
  } else if (a === "--help" || a === "-h") {
    console.log(
      "Usage: node md-to-pdf.js <input.md> [<input2.md> ...] [--out-dir <dir>] [--browser <path>]",
    );
    process.exit(0);
  } else if (a.startsWith("--")) {
    console.error(`Unknown option: ${a}`);
    process.exit(2);
  } else {
    inputs.push(a);
  }
}

if (inputs.length === 0) {
  console.error(
    "No input files. Usage: node md-to-pdf.js <input.md> [...] [--out-dir <dir>] [--browser <path>]",
  );
  process.exit(2);
}

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Browser discovery.
// ---------------------------------------------------------------------------

function findBrowser() {
  if (browserOverride) {
    if (!fs.existsSync(browserOverride)) {
      throw new Error(`--browser path not found: ${browserOverride}`);
    }
    return browserOverride;
  }
  if (process.env.BROWSER_BIN && fs.existsSync(process.env.BROWSER_BIN)) {
    return process.env.BROWSER_BIN;
  }
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/microsoft-edge",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `No supported browser found. Tried:\n  ${candidates.join("\n  ")}\n` +
      `Set BROWSER_BIN=<path> or pass --browser <path>.`,
  );
}

// ---------------------------------------------------------------------------
// HTML shell + URL helper.
// ---------------------------------------------------------------------------

const STYLE = `
  @page { size: Letter; margin: 18mm 16mm; }
  body { font: 11pt/1.45 -apple-system, "Segoe UI", Arial, sans-serif; color: #222; max-width: 100%; }
  h1 { font-size: 22pt; margin-top: 0; }
  h2 { font-size: 16pt; margin-top: 1.6em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
  h3 { font-size: 13pt; margin-top: 1.4em; }
  h4 { font-size: 11.5pt; margin-top: 1.2em; }
  p, ul, ol, table { margin: 0.6em 0; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 1.6em 0; }
  blockquote { margin: 0.6em 0; padding: 0.4em 1em; background: #f5f7fa; border-left: 3px solid #888; color: #444; }
  code { font: 9.5pt/1.4 "Cascadia Mono", "Consolas", monospace; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f3f4f6; padding: 0.8em; border-radius: 4px; overflow: auto; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f5f7fa; }
  img { max-width: 100%; height: auto; display: block; margin: 0.6em auto; }
  a { color: #1a5fb4; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

function htmlShell(title, body) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<style>${STYLE}</style>
</head><body>
${body}
</body></html>
`;
}

/**
 * Build a `file://` URL the browser can open. Handles Windows UNC paths,
 * Windows drive-letter paths, and POSIX paths.
 */
function toFileUrl(p) {
  if (p.startsWith("\\\\")) {
    // UNC: \\server\share\path → file://server/share/path
    return "file:" + p.replace(/\\/g, "/");
  }
  if (/^[A-Za-z]:[\\/]/.test(p)) {
    // Drive letter: C:\path → file:///C:/path
    return "file:///" + p.replace(/\\/g, "/");
  }
  // POSIX absolute or relative — resolve to absolute first.
  return "file://" + path.resolve(p);
}

// ---------------------------------------------------------------------------
// Conversion.
// ---------------------------------------------------------------------------

function convert(browser, mdPath) {
  const sourceDir = path.dirname(mdPath);
  const basename = path.basename(mdPath, path.extname(mdPath));
  // Temp HTML always lives next to the source so relative image paths
  // resolve against the source's folder.
  const htmlPath = path.join(sourceDir, `.${basename}.tmp.html`);
  const pdfDir = outDir ? path.resolve(outDir) : sourceDir;
  const pdfPath = path.join(pdfDir, `${basename}.pdf`);

  const md = fs.readFileSync(mdPath, "utf-8");
  const body = marked.parse(md);
  fs.writeFileSync(htmlPath, htmlShell(basename, body), "utf-8");

  console.log(`  → ${pdfPath}`);

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    toFileUrl(htmlPath),
  ];
  const result = child_process.spawnSync(browser, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Best-effort cleanup; leave the temp HTML for debugging if removal fails.
  try {
    fs.unlinkSync(htmlPath);
  } catch (_) {}

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString() : "";
    throw new Error(
      `Browser exited ${result.status} for ${mdPath}.\n${stderr}`,
    );
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Browser reported success but no PDF written: ${pdfPath}`);
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

let browser;
try {
  browser = findBrowser();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
console.log(`Using browser: ${browser}`);

let failed = 0;
for (const input of inputs) {
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    failed++;
    continue;
  }
  console.log(`\n${input}`);
  try {
    convert(browser, input);
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} file(s) failed.`);
  process.exit(1);
}
console.log("\nDone.");
