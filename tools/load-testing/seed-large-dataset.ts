/**
 * Bulk-insert synthetic `documents` rows for load testing (PostgreSQL).
 * Uses raw SQL + generate_series for throughput. Does not create blob files.
 *
 * Usage:
 *   DATABASE_URL=... npm run seed -- --count=1000 --group-id=seed-default-group
 *
 * @see README.md
 */
import "dotenv/config";
import pg from "pg";

const ID_PREFIX = "ldt-";
const DEFAULT_COUNT = 1000;
const DEFAULT_BATCH = 10_000;
const DEFAULT_GROUP_ID = "seed-default-group";

type ParsedArgs = {
  count: number;
  groupId: string;
  batchSize: number;
  dryRun: boolean;
  deleteByPrefix: boolean;
};

function printHelp(): void {
  console.log(`Usage: tsx seed-large-dataset.ts [options]

Options:
  --count=N           Rows to insert (default ${DEFAULT_COUNT})
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
INSERT INTO documents (
  id,
  title,
  "original_filename",
  file_path,
  file_type,
  file_size,
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
  'Load test document ' || ($1 + gs.i)::text,
  'load-' || ($1 + gs.i)::text || '.pdf',
  'loadtest/' || ($1 + gs.i)::text || '.pdf',
  'application/pdf',
  1024,
  'load-test-seed',
  'extracted'::"DocumentStatus",
  NOW(),
  NOW(),
  'prebuilt-layout',
  $2,
  NULL
FROM generate_series(1, $4) AS gs(i)
`;
  const r = await client.query(sql, [offset, groupId, ID_PREFIX, batchSize]);
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
      `[load-test-seed] dry-run (no DATABASE_URL): would insert ${args.count} documents into group "${args.groupId}" in batches of ${args.batchSize}.`,
    );
    return;
  }

  if (args.count > 100_000) {
    console.warn(
      `[load-test-seed] Inserting ${args.count} rows may take significant time and disk. Ensure this is a disposable database.`,
    );
  }

  const pool = new pg.Pool({ connectionString: databaseUrl!, max: 1 });
  const client = await pool.connect();

  try {
    await ensureGroupExists(client, args.groupId);

    if (args.dryRun) {
      console.log(
        `[load-test-seed] dry-run: would insert ${args.count} documents into group "${args.groupId}" in batches of ${args.batchSize}.`,
      );
      return;
    }

    if (args.deleteByPrefix) {
      const removed = await deleteByIdPrefix(client, args.groupId);
      console.log(
        `[load-test-seed] Deleted ${removed} documents with id prefix "${ID_PREFIX}" in group "${args.groupId}".`,
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
      if (inserted % 50_000 === 0 || inserted === args.count) {
        console.log(
          `[load-test-seed] inserted ${inserted}/${args.count} (${Math.round(Date.now() - start)}ms elapsed)`,
        );
      }
    }

    console.log(
      `[load-test-seed] done: ${inserted} documents in group "${args.groupId}" (${Date.now() - start}ms total).`,
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

Duplicate generated ids already exist. For a clean rerun against the same group/prefix, run with --delete-by-prefix before inserting, for example:
  npm run load-test:seed -- --delete-by-prefix --count=0 --group-id=<group-id>
or combine cleanup and insert:
  npm run load-test:seed -- --delete-by-prefix --count=<N> --group-id=<group-id>`;
  }

  return error instanceof Error ? error.message : String(error);
}

main().catch((err: unknown) => {
  console.error(formatSeedError(err));
  process.exit(1);
});
