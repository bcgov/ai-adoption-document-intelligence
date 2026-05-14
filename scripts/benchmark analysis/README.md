# Benchmark run analysis

Local helpers for inspecting a downloaded benchmark run.

- `analyze.js` — produces a markdown summary with per-field metrics and confidence-threshold trade-offs.
- `md-to-pdf.js` — renders any markdown file to PDF via headless Edge / Chrome (used to ship the analysis or related reports as a PDF).

## Folder layout

```
scripts/benchmark analysis/
├── analyze.js       ← analysis script (committed)
├── md-to-pdf.js     ← markdown → PDF script (committed)
├── package.json     ← declares the `marked` dep used by md-to-pdf.js (committed)
├── README.md        ← this file (committed)
├── drop/            ← put your downloaded benchmark JSON here (gitignored)
└── output/          ← generated markdown reports land here (gitignored)
```

`drop/` and `output/` only retain a `.gitignore` in the repo so the folders
exist; everything else inside them is ignored. Real benchmark data may
contain ground-truth and predictions you don't want to commit.

## Usage

1. Download a benchmark run from the run detail page (the **Download Results**
   button), or hit the API directly:

   ```bash
   curl -H "x-api-key: $API_KEY" \
     "http://localhost:3002/api/benchmark/projects/$PROJECT_ID/runs/$RUN_ID/download" \
     -o "scripts/benchmark analysis/drop/my-run.json"
   ```

2. Run the analysis:

   ```bash
   node "scripts/benchmark analysis/analyze.js"
   ```

   - With no arguments and exactly one `.json` file in `drop/`, that file is
     used. Otherwise it looks for `drop/sample.json`.
   - The report is written to `output/<input-basename>.md`.

3. Override paths if you need to:

   ```bash
   node "scripts/benchmark analysis/analyze.js" path/to/run.json path/to/report.md
   ```

## What the report contains

- **Run summary** — definition, status, duration, sample pass/fail counts.
- **Overall metrics recomputed from `perFieldResults`** — micro accuracy
  (instance-weighted), macro accuracy (field-weighted), totals. Recomputing
  matters because field rows in the export may have been edited by hand.
- **Per-field results** sorted by error rate, with confidence broken out for
  correct vs error subsets.
- **Confidence-threshold trade-offs**: the smallest review-gate threshold
  that catches 100% / 80% of errors per field, plus how many correct
  predictions would be flagged for review (false positives) at that
  threshold. Gate semantics: `flagged := confidence < threshold`. Fields
  marked `⚠ overlap` have correct predictions sitting at or below the
  highest error confidence — confidence gating cannot cleanly separate
  errors from correct predictions for those.
- **Confidence calibration** overview and **top error contributors**.
- **Suggestions** for follow-up analyses (per-sample worst documents,
  missing-vs-wrong split, cross-field error correlation, baseline diffs,
  etc).

## Notes

- `analyze.js` has no external dependencies — plain Node.js.
- Input must be the JSON returned by `GET /api/benchmark/projects/:projectId/runs/:runId/download`.
- False-positive counts come from `perSampleResults` (which carries the
  full confidence distribution per instance), not from `perFieldResults`
  (which only carries the error subset).

## Generating PDFs from markdown

`md-to-pdf.js` renders one or more `.md` files to `.pdf` using a headless
browser. Resolves images via paths relative to the source markdown.

### One-time setup

Install the `marked` dependency:

```bash
cd "scripts/benchmark analysis"
npm install
```

### Usage

```bash
node md-to-pdf.js <input.md> [<input2.md> ...] [--out-dir <dir>] [--browser <path>]
```

- By default the PDF is written next to the source markdown.
- `--out-dir <dir>` redirects output to a folder (created if missing).
- `--browser <path>` overrides browser auto-detection (also: `BROWSER_BIN` env var).

### Browser auto-detection

| Platform | Tries (in order) |
|---|---|
| Windows | Edge x64 → Edge x86 → Chrome x64 → Chrome x86 |
| macOS | Edge.app → Chrome.app → Chromium.app |
| Linux | `microsoft-edge` → `google-chrome` → `chromium` |

### Examples

```bash
# Local file
node md-to-pdf.js report.md

# Multiple files, output co-located with sources
node md-to-pdf.js a.md b.md c.md
```

Running from WSL against Windows-only paths (network shares, `C:\`, etc.) — invoke the Windows Node so the browser and the file share use the same SMB/file stack:

```bash
"/mnt/c/Program Files/nodejs/node.exe" \
  '\\wsl.localhost\Ubuntu\home\<user>\GitHub\ai-adoption-document-intelligence\scripts\benchmark analysis\md-to-pdf.js' \
  '\\server\share\folder\report.md'
```

(Replace `Ubuntu` with your WSL distro from `wsl -l -q` if different.)
