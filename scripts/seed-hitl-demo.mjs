#!/usr/bin/env node
/**
 * Seed the HITL demo documents from `data/hitl-demo/` fixtures so the review
 * queue can be recreated after a DB reset WITHOUT re-running (paid) Azure OCR.
 * Inverse of `capture-hitl-demo.mjs`.
 *
 * For each fixture dir it:
 *   1. uploads the source image + captured normalized PDF to blob storage
 *      under `<group>/ocr/<docId>/…` — using whichever provider the backend is
 *      configured for (Azure Blob or MinIO/S3), so the blobs land where the app
 *      actually reads them,
 *   2. inserts the `documents` row (status `awaiting_review`), and
 *   3. inserts the `ocr_results` row (keyValuePairs + content + enrichment).
 *
 * Document ids are deterministic (`hitl-demo-<slug>`), so the script is
 * idempotent: re-running deletes and recreates each demo doc (cascade removes
 * its OCR result, review sessions, and locks). It is generic — it seeds
 * whatever fixtures exist under data/hitl-demo/, with no document-specific logic.
 *
 * Usage (infra up; run AFTER the base seed so the target group exists):
 *   npm run test:db:reset && npm run seed:hitl-demo
 *
 * Env (loaded from apps/backend-services/.env, never printed):
 *   DATABASE_URL (required); BLOB_STORAGE_PROVIDER (azure | minio);
 *   Azure: AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_CONTAINER_NAME;
 *   MinIO: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_DOCUMENT_BUCKET;
 *   HITL_DEMO_GROUP_ID (default "seeddefaultgroup").
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BlobServiceClient } from "@azure/storage-blob";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const FIXTURES_DIR = resolve(REPO_ROOT, "data/hitl-demo");

const BACKEND_ENV = resolve(REPO_ROOT, "apps/backend-services/.env");
if (existsSync(BACKEND_ENV)) {
  try {
    process.loadEnvFile(BACKEND_ENV);
  } catch {
    // ignore — fall back to shell env + defaults
  }
}

const GROUP_ID = process.env.HITL_DEMO_GROUP_ID ?? "seeddefaultgroup";
// Mirror the backend's provider selection (blob-storage.module.ts) so the seed
// writes to the SAME store the app reads from — Azure Blob or MinIO/S3.
const PROVIDER = process.env.BLOB_STORAGE_PROVIDER ?? "minio";

function contentTypeFor(file) {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/jpeg";
}

/**
 * Build a blob uploader matching the configured provider. Returns
 * `{ label, put(key, body, contentType) }`. Blob keys are the document
 * file paths (e.g. `<group>/ocr/<id>/normalized.pdf`).
 */
async function createUploader() {
  if (PROVIDER === "azure") {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn) {
      throw new Error(
        "BLOB_STORAGE_PROVIDER=azure but AZURE_STORAGE_CONNECTION_STRING is not set.",
      );
    }
    const containerName =
      process.env.AZURE_STORAGE_CONTAINER_NAME ?? "document-blobs";
    const container =
      BlobServiceClient.fromConnectionString(conn).getContainerClient(
        containerName,
      );
    await container.createIfNotExists();
    return {
      label: `azure:${containerName}`,
      put: async (key, body, contentType) => {
        await container.getBlockBlobClient(key).uploadData(body, {
          blobHTTPHeaders: { blobContentType: contentType },
        });
      },
    };
  }

  const bucket = process.env.MINIO_DOCUMENT_BUCKET ?? "document-blobs";
  const s3 = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:19000",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    },
    forcePathStyle: true,
  });
  return {
    label: `minio:${bucket}`,
    put: async (key, body, contentType) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  };
}

async function seedOne(client, uploader, slug) {
  const dir = resolve(FIXTURES_DIR, slug);
  const meta = JSON.parse(readFileSync(resolve(dir, "meta.json"), "utf-8"));
  const ocr = JSON.parse(readFileSync(resolve(dir, "ocr.json"), "utf-8"));

  const docId = `hitl-demo-${slug}`;
  const ocrId = `hitl-demo-ocr-${slug}`;
  const sourceImageAbs = resolve(REPO_ROOT, meta.sourceImage);
  if (!existsSync(sourceImageAbs)) {
    throw new Error(`source image missing: ${meta.sourceImage}`);
  }
  const normalizedAbs = resolve(dir, "normalized.pdf");

  const originalExt = extname(meta.sourceImage) || ".jpg";
  const originalKey = `${GROUP_ID}/ocr/${docId}/original${originalExt}`;
  const normalizedKey = `${GROUP_ID}/ocr/${docId}/normalized.pdf`;

  // 1. Blobs
  await uploader.put(
    originalKey,
    readFileSync(sourceImageAbs),
    contentTypeFor(originalExt),
  );
  await uploader.put(
    normalizedKey,
    readFileSync(normalizedAbs),
    "application/pdf",
  );

  const fileSize = meta.fileSize ?? statSync(sourceImageAbs).size;
  const metadata = { ...(meta.metadata ?? {}), hitlDemo: true };

  // 2 + 3. DB rows (idempotent: delete cascades ocr_results/sessions/locks)
  await client.query("begin");
  try {
    await client.query("delete from documents where id = $1", [docId]);
    await client.query(
      `insert into documents
         (id, title, original_filename, file_path, file_type, file_size,
          source, status, model_id, group_id, normalized_file_path,
          content_hash, metadata, created_at, updated_at)
       values
         ($1,$2,$3,$4,$5,$6,$7,'awaiting_review'::"DocumentStatus",
          $8,$9,$10,$11,$12::jsonb, now(), now())`,
      [
        docId,
        meta.title,
        meta.originalFilename,
        originalKey,
        meta.fileType,
        fileSize,
        meta.source ?? "api",
        meta.modelId,
        GROUP_ID,
        normalizedKey,
        meta.contentHash ?? null,
        JSON.stringify(metadata),
      ],
    );
    await client.query(
      `insert into ocr_results
         (id, document_id, "keyValuePairs", content, enrichment_summary, processed_at)
       values ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb, now())`,
      [
        ocrId,
        docId,
        JSON.stringify(ocr.keyValuePairs ?? {}),
        ocr.content == null ? null : JSON.stringify(ocr.content),
        ocr.enrichmentSummary == null
          ? null
          : JSON.stringify(ocr.enrichmentSummary),
      ],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { docId, title: meta.title };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  if (!existsSync(FIXTURES_DIR)) {
    console.log(`No fixtures at ${FIXTURES_DIR} — nothing to seed.`);
    return;
  }
  const slugs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(resolve(FIXTURES_DIR, name, "meta.json")))
    .sort();
  if (slugs.length === 0) {
    console.log("No HITL demo fixtures found.");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const { rows: groupRows } = await client.query(
    'select 1 from "group" where id = $1',
    [GROUP_ID],
  );
  if (groupRows.length === 0) {
    console.error(
      `Group "${GROUP_ID}" not found. Run the base seed first (npm run test:db:reset).`,
    );
    await client.end();
    process.exit(1);
  }

  let uploader;
  try {
    uploader = await createUploader();
  } catch (err) {
    console.error(`Blob storage init failed: ${err.message}`);
    await client.end();
    process.exit(1);
  }
  console.log(`Blob target: ${uploader.label}`);

  let seeded = 0;
  for (const slug of slugs) {
    try {
      const { title } = await seedOne(client, uploader, slug);
      seeded += 1;
      console.log(`  ✓ ${title} (hitl-demo-${slug})`);
    } catch (err) {
      console.error(`  ✗ ${slug}: ${err.message}`);
    }
  }

  await client.end();
  console.log(
    `\nSeeded ${seeded}/${slugs.length} HITL demo document(s) into group "${GROUP_ID}".`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
