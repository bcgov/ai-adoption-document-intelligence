const { PrismaClient } = require('../apps/backend-services/src/generated/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
const pg = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../apps/backend-services/.env') });

async function createTestApiKey() {
  // Create PostgreSQL connection pool
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const testKey = process.env.TEST_API_KEY || '69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY';
  const keyPrefix = testKey.substring(0, 8);
  const keyHash = await bcrypt.hash(testKey, 10);

  try {
    // Check if test key already exists
    const existing = await prisma.apiKey.findUnique({
      where: { user_id: 'test-user' },
    });

    if (existing) {
      console.log('Test API key already exists, updating...');
      await prisma.apiKey.update({
        where: { user_id: 'test-user' },
        data: {
          key_hash: keyHash,
          key_prefix: keyPrefix,
          user_email: 'test@example.com',
        },
      });
    } else {
      console.log('Creating test API key...');
      await prisma.apiKey.create({
        data: {
          key_hash: keyHash,
          key_prefix: keyPrefix,
          user_id: 'test-user',
          user_email: 'test@example.com',
        },
      });
    }

    console.log('✅ Test API key created/updated successfully!');
    console.log('Key:', testKey);
    console.log('Prefix:', keyPrefix);
    console.log('User ID: test-user');
    console.log('User Email: test@example.com');
  } catch (error) {
    console.error('Error creating test API key:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

createTestApiKey().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
