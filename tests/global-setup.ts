import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..');

/**
 * Hosts the destructive reset is allowed to touch. Everything this repo's own
 * config points at is here: `localhost` (.env.sample, the Dockerfile
 * placeholders), `127.0.0.1`/`::1` (loopback spellings of the same),
 * `host.docker.internal` (a container reaching the host's Postgres), and
 * `postgres` (the docker-compose service name, resolvable only inside the
 * compose network).
 */
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres']);

/**
 * Refuse to reset a database that is not local.
 *
 * `prisma migrate reset --force` (below) destroys whatever `DATABASE_URL`
 * names, and this machine port-forwards remote databases. One stale
 * environment variable or swapped `.env` is the whole distance between
 * "reset my dev DB" and an incident, so anything but a known-local host is
 * refused outright — there is deliberately no override for a remote host;
 * `PLAYWRIGHT_SKIP_DB_RESET=1` skips the reset instead.
 *
 * Resolution mirrors what Prisma will actually use: `process.env.DATABASE_URL`
 * first, else `DATABASE_URL` from `apps/backend-services/.env` (prisma.config.ts
 * does `import "dotenv/config"` with that cwd). If the URL cannot be resolved
 * or parsed, the reset is refused too — an unverifiable target is treated as
 * non-local, never waved through.
 */
export function assertLocalDatabaseUrl(backendDir: string): void {
  let raw = process.env.DATABASE_URL;
  if (!raw) {
    const envFile = path.join(backendDir, '.env');
    if (fs.existsSync(envFile)) {
      const match = fs
        .readFileSync(envFile, 'utf8')
        .match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]*))/m);
      raw = (match?.[1] ?? match?.[2] ?? match?.[3])?.trim();
    }
  }

  let host: string | undefined;
  if (raw) {
    try {
      // Strip IPv6 brackets so `[::1]` matches the allowlist entry `::1`.
      host = new URL(raw).hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
    } catch {
      host = undefined;
    }
  }

  if (!host) {
    console.error(
      '\n❌ Refusing the database reset: DATABASE_URL could not be resolved or\n' +
        '   parsed, so there is no way to verify it points at a local database.\n' +
        '   Set DATABASE_URL to your local Postgres, or set\n' +
        '   PLAYWRIGHT_SKIP_DB_RESET=1 to run without resetting.\n'
    );
    process.exit(1);
  }

  if (!LOCAL_DB_HOSTS.has(host)) {
    console.error(
      `\n❌ Refusing the database reset: DATABASE_URL points at "${host}", which\n` +
        `   is not a local host (allowed: ${Array.from(LOCAL_DB_HOSTS).join(', ')}).\n` +
        '   This machine port-forwards remote databases, and `prisma migrate reset\n' +
        '   --force` would destroy that one. There is no override for a remote\n' +
        '   host; point DATABASE_URL at your local Postgres, or set\n' +
        '   PLAYWRIGHT_SKIP_DB_RESET=1 to run against the existing data without\n' +
        '   resetting.\n'
    );
    process.exit(1);
  }
}

/**
 * Type-check the frontend before anything else runs.
 *
 * Why this is worth 6 seconds: the e2e suite drives the RUNNING dev server, and
 * Vite transforms modules lazily per request. A type or syntax error in a
 * component therefore never announces itself as a build failure — the module
 * just fails to evaluate in the browser, the canvas never mounts, and every
 * spec dies on `waiting for locator('.react-flow__node')`. You spend the next
 * twenty minutes debugging the tests instead of reading the one-line compiler
 * error. (The backend is not checked here: it would fail to boot outright,
 * which is self-announcing.)
 *
 * It runs BEFORE the database reset on purpose. Code that does not compile
 * cannot pass, so there is no reason to spend a minute wiping and reseeding
 * first — and an aborted seed leaves the database EMPTY rather than unchanged.
 */
function typeCheckFrontend(): void {
  if (process.env.PLAYWRIGHT_SKIP_TYPE_CHECK) {
    console.log('\n⏭️  PLAYWRIGHT_SKIP_TYPE_CHECK set — skipping type-check.\n');
    return;
  }

  console.log('\n🔎 Type-checking the frontend...\n');
  try {
    execSync('npm run type-check -w apps/frontend', {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    console.log('\n✅ Frontend type-check clean\n');
  } catch {
    console.error(
      '\n❌ Frontend does not compile — aborting before the database reset.\n' +
        '   Fix the errors above; e2e failures from a broken build are misleading\n' +
        '   (they surface as "canvas never mounted", not as a compile error).\n' +
        '   Set PLAYWRIGHT_SKIP_TYPE_CHECK=1 to bypass.\n'
    );
    process.exit(1);
  }
}

/**
 * Global setup for Playwright tests.
 * Runs once before all tests: type-check, then reset the database.
 */
async function globalSetup() {
  typeCheckFrontend();

  // Escape hatch for running the suite against an already-seeded local stack
  // without wiping it (e.g. while actively developing). The default behaviour
  // — a full reset+seed — is unchanged.
  //
  // ⚠️ Without this flag EVERY playwright run destroys the local database:
  // documents, uploads, run history and the seeded feature demos. Restoring
  // needs `npm run db:seed` plus `node scripts/seed-feature-demos.mjs`;
  // documents are not reproducible at all.
  if (process.env.PLAYWRIGHT_SKIP_DB_RESET) {
    console.log('\n⏭️  PLAYWRIGHT_SKIP_DB_RESET set — skipping database reset.\n');
    return;
  }

  const backendDir = path.resolve(repoRoot, 'apps/backend-services');

  // Runs even when the type-check passed or was skipped: nothing destructive
  // happens before the target is proven local.
  assertLocalDatabaseUrl(backendDir);

  console.log('\n🔄 Resetting database before tests...\n');

  try {
    execSync(
      'PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force && npm run db:seed',
      {
        cwd: backendDir,
        stdio: 'inherit',
        env: process.env,
      }
    );
    console.log('\n✅ Database reset complete\n');
  } catch (error) {
    console.error('\n❌ Database reset failed:', error);
    process.exit(1);
  }
}

export default globalSetup;
