import { execSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..');

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

  console.log('\n🔄 Resetting database before tests...\n');

  const backendDir = path.resolve(repoRoot, 'apps/backend-services');

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
