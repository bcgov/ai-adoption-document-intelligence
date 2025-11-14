#!/usr/bin/env node

/**
 * Test script for the backend services
 * Usage: node test-upload.js [file-path]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:3002';
const ENDPOINT = `${SERVICE_URL}/api/upload`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
  return 'scan';
}

async function testUpload(filePath) {
  try {
    log('\nBackend Services Test Script', 'yellow');
    log('================================\n', 'yellow');

    // Read and encode file
    if (!fs.existsSync(filePath)) {
      log(`Error: File not found: ${filePath}`, 'red');
      process.exit(1);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileBase64 = fileBuffer.toString('base64');
    const stats = fs.statSync(filePath);
    const originalFilename = path.basename(filePath);
    const fileType = getFileType(originalFilename);

    log(`File: ${filePath}`, 'yellow');
    log(`Type: ${fileType}`, 'yellow');
    log(`Original Filename: ${originalFilename}`, 'yellow');
    log(`Size: ${stats.size} bytes\n`, 'yellow');

    // Create payload
    const payload = JSON.stringify({
      title: `Test Upload - ${new Date().toISOString()}`,
      file: fileBase64,
      file_type: fileType,
      original_filename: originalFilename,
      metadata: {
        test: true,
        uploaded_at: new Date().toISOString(),
        file_size: stats.size,
      },
    });

    log(`Sending request to: ${ENDPOINT}\n`, 'yellow');

    // Send request
    const url = new URL(ENDPOINT);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          log(`HTTP Status Code: ${res.statusCode}\n`, 'yellow');

          if (res.statusCode === 201 || res.statusCode === 200) {
            log('✓ Upload successful!\n', 'green');
            try {
              const json = JSON.parse(data);
              log('Response:', 'yellow');
              console.log(JSON.stringify(json, null, 2));
            } catch (e) {
              console.log(data);
            }
            resolve();
          } else {
            log('✗ Upload failed\n', 'red');
            try {
              const json = JSON.parse(data);
              log('Response:', 'yellow');
              console.log(JSON.stringify(json, null, 2));
            } catch (e) {
              console.log(data);
            }
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        log(`Error: ${error.message}`, 'red');
        log('Make sure the backend services are running!', 'yellow');
        reject(error);
      });

      req.write(payload);
      req.end();
    });
  } catch (error) {
    log(`Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Main execution
const filePath = process.argv[2];

if (!filePath) {
  // Create a test file
  const testFile = `test-upload-${Date.now()}.txt`;
  fs.writeFileSync(testFile, `This is a test file created at ${new Date().toISOString()}\n`);
  log(`No file provided, created test file: ${testFile}`, 'yellow');
  
  testUpload(testFile)
    .then(() => {
      fs.unlinkSync(testFile);
      log('\n================================', 'yellow');
      log('Test completed', 'yellow');
    })
    .catch((error) => {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      process.exit(1);
    });
} else {
  testUpload(filePath)
    .then(() => {
      log('\n================================', 'yellow');
      log('Test completed', 'yellow');
    })
    .catch(() => {
      process.exit(1);
    });
}

