import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Global setup for Playwright tests
 * Runs once before all tests to reset the database
 */
async function globalSetup() {
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
