/**
 * Example script to trigger an OCR workflow
 * Run with: npm run example
 */

import { executeOCRWorkflow } from './client';

async function main() {
  console.log('[Example] Starting OCR workflow example...\n');

  // Example 1: Using a sample base64-encoded PDF (minimal valid PDF)
  // In a real scenario, you would read a file and encode it
  const minimalPdfBase64 = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT\n/F1 12 Tf\n100 700 Td\n(Hello World) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000206 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n300\n%%EOF'
  ).toString('base64');

  try {
    console.log('[Example] Starting workflow with sample PDF data...');
    const result = await executeOCRWorkflow({
      documentId: 'example-document-id',
      binaryData: minimalPdfBase64,
      fileName: 'example.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
    });

    console.log('\n[Example] Workflow completed successfully!');
    console.log('[Example] Result summary:');
    console.log(`  - Success: ${result.success}`);
    console.log(`  - Status: ${result.status}`);
    console.log(`  - File Name: ${result.fileName}`);
    console.log(`  - Extracted Text Length: ${result.extractedText.length} characters`);
    console.log(`  - Pages: ${result.pages.length}`);
    console.log(`  - Tables: ${result.tables.length}`);
    console.log(`  - Paragraphs: ${result.paragraphs.length}`);
    console.log(`  - Key-Value Pairs: ${result.keyValuePairs.length}`);
    console.log(`  - Processed At: ${result.processedAt}`);
    console.log(`\n[Example] View this workflow in Temporal Web UI: http://localhost:8088`);
  } catch (error) {
    console.error('[Example] Error executing workflow:', error);
    if (error instanceof Error) {
      console.error('[Example] Error message:', error.message);
      console.error('[Example] Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Example] Fatal error:', error);
    process.exit(1);
  });
}

