/**
 * Insert disposable HITL-eligible documents plus OCR results for review API load tests.
 *
 * Documents are synthetic, source="api", completed_ocr, and use id prefix "ldt-hitl-".
 * Deleting by prefix cascades review sessions, locks, corrections, and OCR results.
 */
import "dotenv/config";
import pg from "pg";

const ID_PREFIX = "ldt-hitl-";
const OCR_PREFIX = "ldt-hitl-ocr-";
const DEFAULT_COUNT = 100;
const DEFAULT_BATCH = 1_000;
const DEFAULT_GROUP_ID = "seed-default-group";

type ParsedArgs = {
  count: number;
  groupId: string;
  batchSize: number;
  dryRun: boolean;
  deleteByPrefix: boolean;
};

function printHelp(): void {
  console.log(`Usage: tsx seed-hitl-fixtures.ts [options]

Options:
  --count=N           HITL fixture documents to insert (default ${DEFAULT_COUNT})
  --group-id=ID       Target group (default ${DEFAULT_GROUP_ID})
  --batch-size=N      Insert chunk size (default ${DEFAULT_BATCH})
  --dry-run           Validate / plan only
  --delete-by-prefix  Remove ids with prefix "${ID_PREFIX}" in the group first
  --help              Show this message

Requires DATABASE_URL except for --dry-run without DB (plan only).
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  let count = DEFAULT_COUNT;
  let groupId = DEFAULT_GROUP_ID;
  let batchSize = DEFAULT_BATCH;
  let dryRun = false;
  let deleteByPrefix = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--delete-by-prefix") deleteByPrefix = true;
    else if (arg.startsWith("--count="))
      count = Math.max(0, parseInt(arg.slice("--count=".length), 10) || 0);
    else if (arg.startsWith("--group-id="))
      groupId = arg.slice("--group-id=".length);
    else if (arg.startsWith("--batch-size="))
      batchSize = Math.max(
        100,
        parseInt(arg.slice("--batch-size=".length), 10) || DEFAULT_BATCH,
      );
  }

  return { count, groupId, batchSize, dryRun, deleteByPrefix };
}

async function ensureGroupExists(
  client: pg.PoolClient,
  groupId: string,
): Promise<void> {
  const r = await client.query(`SELECT 1 FROM "group" WHERE id = $1 LIMIT 1`, [
    groupId,
  ]);
  if (r.rowCount === 0) {
    throw new Error(
      `Group "${groupId}" does not exist. Run prisma db seed first or pass --group-id= of an existing group.`,
    );
  }
}

async function deleteByIdPrefix(
  client: pg.PoolClient,
  groupId: string,
): Promise<number> {
  const r = await client.query(
    `DELETE FROM documents WHERE "group_id" = $1 AND id LIKE $2`,
    [groupId, `${ID_PREFIX}%`],
  );
  return r.rowCount ?? 0;
}

async function insertBatch(
  client: pg.PoolClient,
  groupId: string,
  offset: number,
  batchSize: number,
): Promise<number> {
  const sql = `
WITH inserted_documents AS (
  INSERT INTO documents (
    id,
    title,
    "original_filename",
    file_path,
    file_type,
    file_size,
    metadata,
    source,
    status,
    created_at,
    updated_at,
    model_id,
    "group_id",
    "workflow_execution_id"
  )
  SELECT
    $3 || ($1 + gs.i)::text,
    'HITL load test document ' || ($1 + gs.i)::text,
    'hitl-load-' || ($1 + gs.i)::text || '.pdf',
    'loadtest/hitl/' || ($1 + gs.i)::text || '.pdf',
    'application/pdf',
    1024,
    jsonb_build_object(
      'loadTest', true,
      'loadTestRunId', 'hitl-fixture',
      'scenario', 'review-hitl-apis',
      'synthetic', true
    ),
    'api',
    'completed_ocr'::"DocumentStatus",
    NOW(),
    NOW(),
    'prebuilt-layout',
    $2,
    NULL
  FROM generate_series(1, $4) AS gs(i)
  RETURNING id
)
INSERT INTO ocr_results (
  id,
  document_id,
  "keyValuePairs",
  enrichment_summary,
  processed_at
)
SELECT
  $5 || substring(id from length($3) + 1),
  id,
  jsonb_build_object(
    'load_test_field',
    jsonb_build_object(
      'value',
      'synthetic review value ' || substring(id from length($3) + 1),
      'confidence',
      0.42
    )
  ),
  jsonb_build_object('synthetic', true, 'scenario', 'review-hitl-apis'),
  NOW()
FROM inserted_documents
`;
  const r = await client.query(sql, [
    offset,
    groupId,
    ID_PREFIX,
    batchSize,
    OCR_PREFIX,
  ]);
  return r.rowCount ?? batchSize;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl && !args.dryRun) {
    throw new Error(
      "DATABASE_URL is required (omit only with --dry-run and no inserts).",
    );
  }

  if (args.dryRun && !databaseUrl) {
    console.log(
      `[load-test-hitl-fixtures] dry-run (no DATABASE_URL): would insert ${args.count} HITL documents into group "${args.groupId}" in batches of ${args.batchSize}.`,
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl!, max: 1 });
  const client = await pool.connect();

  try {
    await ensureGroupExists(client, args.groupId);

    if (args.dryRun) {
      console.log(
        `[load-test-hitl-fixtures] dry-run: would insert ${args.count} HITL documents into group "${args.groupId}" in batches of ${args.batchSize}.`,
      );
      return;
    }

    if (args.deleteByPrefix) {
      const removed = await deleteByIdPrefix(client, args.groupId);
      console.log(
        `[load-test-hitl-fixtures] Deleted ${removed} documents with id prefix "${ID_PREFIX}" in group "${args.groupId}".`,
      );
      if (args.count === 0) return;
    }

    let inserted = 0;
    let offset = 0;
    const start = Date.now();

    while (inserted < args.count) {
      const thisBatch = Math.min(args.batchSize, args.count - inserted);
      await insertBatch(client, args.groupId, offset, thisBatch);
      inserted += thisBatch;
      offset += thisBatch;
      console.log(
        `[load-test-hitl-fixtures] inserted ${inserted}/${args.count} (${Math.round(Date.now() - start)}ms elapsed)`,
      );
    }

    console.log(
      `[load-test-hitl-fixtures] done: ${inserted} HITL documents in group "${args.groupId}" (${Date.now() - start}ms total).`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

function formatSeedError(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  ) {
    return `${error.message}

Duplicate generated HITL fixture ids already exist. For a clean rerun against the same group/prefix, run with --delete-by-prefix before inserting, for example:
  npm run load-test:hitl-fixtures -- --delete-by-prefix --count=0 --group-id=<group-id>
or combine cleanup and insert:
  npm run load-test:hitl-fixtures -- --delete-by-prefix --count=<N> --group-id=<group-id>`;
  }

  return error instanceof Error ? error.message : String(error);
}

main().catch((err: unknown) => {
  console.error(formatSeedError(err));
  process.exit(1);
});
