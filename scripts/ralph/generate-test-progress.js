#!/usr/bin/env node
/**
 * Generates initial test-fixer-progress.md file by scanning test directory
 *
 * Usage: node scripts/ralph/generate-test-progress.js <test_folder> <feature_dir>
 * Example: node scripts/ralph/generate-test-progress.js benchmarking feature-docs/003-benchmarking-system/
 */

const fs = require('fs');
const path = require('path');

function findTestFiles(testFolder) {
  const testDir = path.join(process.cwd(), 'tests', 'e2e', testFolder);

  if (!fs.existsSync(testDir)) {
    console.error(`Error: Test directory not found: ${testDir}`);
    process.exit(1);
  }

  const files = [];

  function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
        files.push(fullPath);
      }
    }
  }

  scanDirectory(testDir);
  return files.sort();
}

function generateProgressFile(testFolder, featureDir) {
  // Validate feature directory exists
  if (!fs.existsSync(featureDir)) {
    console.error(`Error: Feature directory not found: ${featureDir}`);
    process.exit(1);
  }

  // Find all test files
  const testFiles = findTestFiles(testFolder);

  if (testFiles.length === 0) {
    console.error(`Error: No test files found in tests/e2e/${testFolder}`);
    process.exit(1);
  }

  // Create progress file directory
  const progressDir = path.join(featureDir, 'playwright');
  const progressFile = path.join(progressDir, 'test-fixer-progress.md');

  if (!fs.existsSync(progressDir)) {
    fs.mkdirSync(progressDir, { recursive: true });
  }

  // Generate progress content
  const lines = [
    '# Test Fixer Progress',
    '',
    `Test folder: \`tests/e2e/${testFolder}\``,
    `Feature directory: \`${featureDir}\``,
    '',
    '## Test Files',
    ''
  ];

  for (const file of testFiles) {
    const basename = path.basename(file);
    lines.push(`- [ ] ${basename}`);
  }

  lines.push('');

  // Write progress file
  fs.writeFileSync(progressFile, lines.join('\n'));

  console.log(`Created progress file: ${progressFile}`);
  console.log(`Found ${testFiles.length} test files in tests/e2e/${testFolder}`);
  console.log('');
  console.log('Test files:');
  testFiles.forEach((file, i) => {
    console.log(`  ${i + 1}. ${path.basename(file)}`);
  });
  console.log('');
  console.log('Next step:');
  console.log(`  node scripts/ralph/convert-tests-to-progress.js ${testFolder} ${featureDir}`);
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node generate-test-progress.js <test_folder> <feature_dir>');
  console.error('Example: node scripts/ralph/generate-test-progress.js benchmarking feature-docs/003-benchmarking-system/');
  process.exit(1);
}

const testFolder = args[0];
const featureDir = args[1];

generateProgressFile(testFolder, featureDir);
