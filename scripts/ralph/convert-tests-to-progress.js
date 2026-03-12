#!/usr/bin/env node
/**
 * Converts test-fixer-progress.md to Ralph's prd.json format
 * Similar to convert-stories-to-prd.js but for test files
 *
 * Usage: node scripts/ralph/convert-tests-to-progress.js <test_folder> <feature_dir>
 * Example: node scripts/ralph/convert-tests-to-progress.js benchmarking feature-docs/003-benchmarking-system/
 */

const fs = require('fs');
const path = require('path');

function parseProgressFile(progressFile, testFolder) {
  if (!fs.existsSync(progressFile)) {
    console.error(`Error: Progress file not found: ${progressFile}`);
    console.error('');
    console.error('Generate it first with:');
    console.error(`  node scripts/ralph/generate-test-progress.js ${testFolder} ${path.dirname(path.dirname(progressFile))}`);
    process.exit(1);
  }

  const content = fs.readFileSync(progressFile, 'utf8');
  const lines = content.split('\n');

  const testFiles = [];
  let inTestFilesSection = false;

  for (const line of lines) {
    if (line.includes('## Test Files')) {
      inTestFilesSection = true;
      continue;
    }

    if (inTestFilesSection && line.trim().startsWith('##')) {
      break;
    }

    if (inTestFilesSection && line.trim().startsWith('- ')) {
      // Parse checkbox line: - [x] filename.spec.ts (✅ Passed)
      // or: - [ ] filename.spec.ts
      const checkboxMatch = line.match(/^- \[([ x])\]\s+(.+?)(?:\s+\([^)]+\))?$/);
      if (checkboxMatch) {
        const checked = checkboxMatch[1] === 'x';
        const filename = checkboxMatch[2].trim();

        if (filename.endsWith('.spec.ts')) {
          const testPath = path.join('tests', 'e2e', testFolder, filename);
          testFiles.push({
            id: filename,
            file: testPath,
            passes: checked,
            notes: checked ? 'Test passing' : ''
          });
        }
      }
    }
  }

  return testFiles;
}

function convertToPrd(testFolder, featureDir) {
  // Validate feature directory exists
  if (!fs.existsSync(featureDir)) {
    console.error(`Error: Feature directory not found: ${featureDir}`);
    process.exit(1);
  }

  const progressFile = path.join(featureDir, 'playwright', 'test-fixer-progress.md');
  const testFiles = parseProgressFile(progressFile, testFolder);

  if (testFiles.length === 0) {
    console.error(`Error: No test files found in ${progressFile}`);
    console.error('Check the markdown file format.');
    process.exit(1);
  }

  // Create prd.json structure
  const prd = {
    mode: 'test-fixer',
    testFolder: testFolder,
    featureDir: featureDir,
    progressFile: progressFile,
    testFiles: testFiles
  };

  // Write to state/prd.json
  const outputPath = path.join(__dirname, 'state', 'prd.json');
  fs.writeFileSync(outputPath, JSON.stringify(prd, null, 2));

  console.log(`Converted ${testFiles.length} test files to ${outputPath}`);
  console.log('');
  console.log('Test files:');
  testFiles.forEach((t, i) => {
    const status = t.passes ? '✅ Passed' : '⏳ Pending';
    console.log(`  ${i + 1}. ${t.id} ${status}`);
  });
  console.log('');
  console.log('Next step:');
  console.log(`  ./scripts/ralph/ralph.sh --mode test-fixer --tool claude ${testFolder} ${featureDir} 25`);
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node convert-tests-to-progress.js <test_folder> <feature_dir>');
  console.error('Example: node scripts/ralph/convert-tests-to-progress.js benchmarking feature-docs/003-benchmarking-system/');
  console.error('');
  console.error('Note: This reads {feature_dir}/playwright/test-fixer-progress.md');
  console.error('Generate it first with: node scripts/ralph/generate-test-progress.js <test_folder> <feature_dir>');
  process.exit(1);
}

const testFolder = args[0];
const featureDir = args[1];

convertToPrd(testFolder, featureDir);
