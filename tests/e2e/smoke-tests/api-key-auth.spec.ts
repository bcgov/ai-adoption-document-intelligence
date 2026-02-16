import { test, expect } from '@playwright/test';

/**
 * Test API key authentication
 * This test verifies that the backend properly handles API key authentication
 * using the x-api-key header.
 */
test.describe('API Key Authentication', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test('should authenticate successfully with valid API key', async ({ request }) => {
    // Test the labeling projects endpoint which supports API key auth
    const response = await request.get(`${BACKEND_URL}/api/labeling/projects`, {
      headers: {
        'x-api-key': TEST_API_KEY!,
      },
    });

    // Should get a successful response
    expect(response.status()).toBe(200);

    // Response should be valid JSON
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should reject request without API key', async ({ request }) => {
    // Test without API key header
    const response = await request.get(`${BACKEND_URL}/api/labeling/projects`);

    // Should be unauthorized
    expect(response.status()).toBe(401);
  });

  test('should reject request with invalid API key', async ({ request }) => {
    // Test with invalid API key
    const response = await request.get(`${BACKEND_URL}/api/labeling/projects`, {
      headers: {
        'x-api-key': 'invalid-api-key-12345',
      },
    });

    // Should be unauthorized
    expect(response.status()).toBe(401);
  });

  test('should authenticate on upload endpoint with API key', async ({ request }) => {
    // Test a simple base64 encoded text file
    const testFileContent = Buffer.from('Test document content').toString('base64');

    const response = await request.post(`${BACKEND_URL}/api/upload`, {
      headers: {
        'x-api-key': TEST_API_KEY!,
        'Content-Type': 'application/json',
      },
      data: {
        title: 'Test Document',
        file: testFileContent,
        file_type: 'txt',
        original_filename: 'test.txt',
      },
    });

    // Should get a successful response or validation error (not auth error)
    // Accept 201 (success) or 400 (validation, but authenticated)
    expect([201, 400]).toContain(response.status());
  });
});
