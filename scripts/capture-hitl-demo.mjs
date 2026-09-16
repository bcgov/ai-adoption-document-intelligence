#!/usr/bin/env node
/**
 * Capture the current HITL demo documents (status `awaiting_review`) into
 * on-disk fixtures under `data/hitl-demo/`, so the demo can be re-seeded later
 * WITHOUT re-running (paid) Azure OCR. See `seed-hitl-demo.mjs` for the inverse.
 *
 * For each captured document we save:
 *   data/hitl-demo/<slug>/meta.json       — document metadata (+ source image ref)
 *   data/hitl-demo/<slug>/ocr.json        — OCR result (keyValuePairs, content, enrichment)
 *   data/hitl-demo/<slug>/normalized.pdf  — the generated normalized PDF the
 *                                           HITL canvas renders (OCR polygons are
 *                                           relative to THIS page, so it must be
 *                                           the exact file, not a regeneration)
 *
 * The original image is NOT duplicated — it is referenced by repo-relative path
 * (the source JPGs already live under data/datasets/…).
 *
 * Selection: documents whose title starts with `HITL ` (the demo convention) and
 * whose original image can be resolved under data/datasets/. Adjust TITLE_PREFIX
 * if you seed the demo under a different naming scheme.
 *
 * Usage (backend must be running on :3002, DB reachable):
 *   node scripts/capture-hitl-demo.mjs
 *
 * Env: DATABASE_URL (required), BACKEND_URL (default http://localhost:3002),
 *      TEST_API_KEY (default: documented local seed key).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(REPO_ROOT, "data/hitl-demo");
const SOURCE_DIR = resolve(REPO_ROOT, "data/datasets/samples-mix/public");

// Load the backend .env so DATABASE_URL / TEST_API_KEY match the running stack,
// WITHOUT printing any secret values. Mirrors scripts/seed-feature-demos.mjs.
const BACKEND_ENV = resolve(REPO_ROOT, "apps/backend-services/.env");
if (existsSync(BACKEND_ENV)) {
  try {
    process.loadEnvFile(BACKEND_ENV);
  } catch {
    // ignore malformed/partial .env — fall back to shell env + defaults
  }
}

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3002";
const API_KEY =
  process.env.TEST_API_KEY ?? "69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY";
const TITLE_PREFIX = "HITL ";

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Resolve the repo-relative source image for a document. The upload used
 * original_filename like "synth-full-1.jpg" derived from the source basename
 * "synth-full (1).jpg". Match by normalising both to a slug.
 */
function resolveSourceImage(originalFilename) {
  if (!existsSync(SOURCE_DIR)) return null;
  const wantSlug = slugify(originalFilename.replace(/\.[^.]+$/, ""));
  for (const f of readdirSync(SOURCE_DIR)) {
    if (!/\.(jpe?g|png)$/i.test(f)) continue;
    if (slugify(f.replace(/\.[^.]+$/, "")) === wantSlug) {
      return `data/datasets/samples-mix/public/${f}`;
    }
  }
  return null;
}

async function fetchBlob(path) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const { rows } = await client.query(
    `select d.id, d.title, d.original_filename, d.file_type, d.file_size,
            d.source, d.model_id, d.content_hash, d.metadata,
            o."keyValuePairs" as key_value_pairs, o.content, o.enrichment_summary
       from documents d
       join ocr_results o on o.document_id = d.id
      where d.status = 'awaiting_review' and d.title like $1
      order by d.title`,
    [`${TITLE_PREFIX}%`],
  );

  if (rows.length === 0) {
    console.log("No awaiting_review demo documents found to capture.");
    await client.end();
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  let captured = 0;
  for (const r of rows) {
    const sourceImage = resolveSourceImage(r.original_filename);
    if (!sourceImage) {
      console.warn(
        `  ⚠ ${r.title}: no source image found for "${r.original_filename}" — skipping`,
      );
      continue;
    }
    const slug = slugify(r.original_filename.replace(/\.[^.]+$/, ""));
    const dir = resolve(OUT_DIR, slug);
    mkdirSync(dir, { recursive: true });

    // The normalized PDF is what the HITL canvas renders; OCR polygons are
    // relative to it, so capture the exact bytes.
    const normalizedPdf = await fetchBlob(`/api/documents/${r.id}/view`);
    writeFileSync(resolve(dir, "normalized.pdf"), normalizedPdf);

    writeFileSync(
      resolve(dir, "meta.json"),
      `${JSON.stringify(
        {
          slug,
          title: r.title,
          originalFilename: r.original_filename,
          fileType: r.file_type,
          fileSize: r.file_size,
          source: r.source,
          modelId: r.model_id,
          contentHash: r.content_hash,
          metadata: r.metadata ?? {},
          sourceImage,
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      resolve(dir, "ocr.json"),
      `${JSON.stringify(
        {
          keyValuePairs: r.key_value_pairs,
          content: r.content,
          enrichmentSummary: r.enrichment_summary,
        },
        null,
        2,
      )}\n`,
    );
    captured += 1;
    console.log(`  ✓ ${r.title} -> data/hitl-demo/${slug}/`);
  }

  await client.end();
  console.log(
    `\nCaptured ${captured} HITL demo document(s) to data/hitl-demo/`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
