import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Global setup for Playwright tests
 * Runs once before all tests to reset the database
 */
async function globalSetup() {
  // Escape hatch for running the suite against an already-seeded local stack
  // without wiping it (e.g. while actively developing). The default behaviour
  // — a full reset+seed — is unchanged.
  if (process.env.PLAYWRIGHT_SKIP_DB_RESET) {
    console.log('\n⏭️  PLAYWRIGHT_SKIP_DB_RESET set — skipping database reset.\n');
    return;
  }

  console.log('\n🔄 Resetting database before tests...\n');

  const backendDir = path.resolve(__dirname, '../apps/backend-services');

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
