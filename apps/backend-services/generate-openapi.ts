/**
 * Generate OpenAPI specification as JSON file
 * Used to create static API documentation
 */

// Set minimal required environment variables BEFORE any imports
process.env.SSO_AUTH_SERVER_URL = process.env.SSO_AUTH_SERVER_URL || 'http://localhost:8080/realms/test';
process.env.SSO_REALM = process.env.SSO_REALM || 'test';
process.env.SSO_CLIENT_ID = process.env.SSO_CLIENT_ID || 'test-client';
process.env.SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET || 'test-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.KEYCLOAK_PUBLIC_KEY = process.env.KEYCLOAK_PUBLIC_KEY || 'dummy-key';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';
process.env.BLOB_STORAGE_TYPE = process.env.BLOB_STORAGE_TYPE || 'filesystem';
process.env.BLOB_STORAGE_ROOT = process.env.BLOB_STORAGE_ROOT || '/tmp/uploads';
process.env.TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
process.env.TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || 'default';
process.env.SKIP_VALIDATION = 'true';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateOpenApiSpec() {
  console.log('Generating OpenAPI specification...');
  
  const app = await NestFactory.create(AppModule, {
    logger: ['error'], // Only show errors
  });

  const config = new DocumentBuilder()
    .setTitle('Document Intelligence Platform API')
    .setDescription('Comprehensive REST API for document processing, OCR, workflow orchestration, model training, and human-in-the-loop review')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'keycloak-sso',
    )
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header' },
      'api-key',
    )
    .addTag('Documents', 'Document management and OCR results')
    .addTag('Upload', 'Document upload endpoints')
    .addTag('Workflow', 'Workflow configuration and execution')
    .addTag('labeling', 'Document labeling projects and annotations')
    .addTag('Training', 'Custom model training')
    .addTag('hitl', 'Human-in-the-loop review queue')
    .addTag('API Keys', 'API key management')
    .addTag('OCR', 'OCR model information')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Write to docs-site assets directory
  const outputDir = path.join(__dirname, '../..', 'docs-site', 'assets');
  const outputPath = path.join(outputDir, 'openapi.json');

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`✅ OpenAPI spec generated at: ${outputPath}`);
  console.log(`📄 Total endpoints: ${Object.keys(document.paths).length}`);
  
  // Count methods
  let methodCount = 0;
  for (const path of Object.values(document.paths)) {
    methodCount += Object.keys(path as any).length;
  }
  console.log(`🔗 Total operations: ${methodCount}`);

  await app.close();
  process.exit(0);
}

generateOpenApiSpec().catch((error) => {
  console.error('Error generating OpenAPI spec:', error);
  process.exit(1);
});
