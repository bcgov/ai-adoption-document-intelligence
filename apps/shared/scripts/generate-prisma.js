#!/usr/bin/env node
/**
 * Shared script to generate Prisma client from shared schema
 * Generates once and copies to both backend-services and temporal apps
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptDir = __dirname;
const sharedDir = path.join(scriptDir, '..');
const schemaPath = path.join(sharedDir, 'prisma/schema.prisma');
const tempOutputPath = path.join(sharedDir, 'prisma/generated-temp');

// Target directories for both apps
const backendServicesPath = path.join(sharedDir, '../backend-services/src/generated');
const temporalPath = path.join(sharedDir, '../temporal/src/generated');

// Create a temporary schema with the correct output path
const tempSchemaPath = path.join(sharedDir, 'prisma/schema-temp.prisma');
const sharedSchema = fs.readFileSync(schemaPath, 'utf-8');
const tempSchema = sharedSchema.replace(
  /generator client \{[\s\S]*?\}/,
  `generator client {
  provider = "prisma-client-js"
  output   = "./generated-temp"
}`
);

// Write temporary schema
fs.writeFileSync(tempSchemaPath, tempSchema);

function removeSourceMaps(dir) {
  if (!fs.existsSync(dir)) return;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeSourceMaps(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      // Remove source map references (both //# and //@ formats)
      const originalContent = content;
      content = content.replace(/\/\/# sourceMappingURL=.*$/gm, '');
      content = content.replace(/\/\/@ sourceMappingURL=.*$/gm, '');
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`Source directory does not exist: ${src}`);
    return;
  }
  
  // Remove destination if it exists
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  
  // Create destination directory
  fs.mkdirSync(dest, { recursive: true });
  
  // Copy all files and directories
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('Generating Prisma client from shared schema...');
  
  // Generate Prisma client to temporary location
  execSync(`npx prisma generate --schema=${tempSchemaPath}`, {
    stdio: 'inherit',
    cwd: sharedDir,
  });
  
  // Remove source map references from generated files
  console.log('Removing source map references from generated files...');
  removeSourceMaps(tempOutputPath);
  
  // Copy to backend-services
  console.log(`Copying generated client to backend-services...`);
  copyDir(tempOutputPath, backendServicesPath);
  removeSourceMaps(backendServicesPath); // Ensure source maps are removed in copy too
  
  // Copy to temporal
  console.log(`Copying generated client to temporal...`);
  copyDir(tempOutputPath, temporalPath);
  removeSourceMaps(temporalPath); // Ensure source maps are removed in copy too
  
  // Clean up temporary files
  console.log('Cleaning up temporary files...');
  if (fs.existsSync(tempOutputPath)) {
    fs.rmSync(tempOutputPath, { recursive: true, force: true });
  }
  if (fs.existsSync(tempSchemaPath)) {
    fs.unlinkSync(tempSchemaPath);
  }
  
  console.log('✓ Prisma client generated and copied to both apps successfully');
  process.exit(0);
} catch (error) {
  console.error('✗ Failed to generate Prisma client:', error.message);
  
  // Clean up on error
  if (fs.existsSync(tempOutputPath)) {
    fs.rmSync(tempOutputPath, { recursive: true, force: true });
  }
  if (fs.existsSync(tempSchemaPath)) {
    fs.unlinkSync(tempSchemaPath);
  }
  
  process.exit(1);
}
