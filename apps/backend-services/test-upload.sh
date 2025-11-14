#!/bin/bash

# Test script for the backend services
# Usage: ./test-upload.sh [file-path]

SERVICE_URL="${SERVICE_URL:-http://localhost:3002}"
ENDPOINT="${SERVICE_URL}/api/upload"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Backend Services Test Script${NC}"
echo "================================"
echo ""

# Check if file path is provided
if [ -z "$1" ]; then
  echo -e "${YELLOW}No file provided, creating a test file...${NC}"
  TEST_FILE="test-upload-$(date +%s).txt"
  echo "This is a test file created at $(date)" > "$TEST_FILE"
  FILE_PATH="$TEST_FILE"
  FILE_TYPE="pdf"
  ORIGINAL_FILENAME="test.txt"
else
  FILE_PATH="$1"
  if [ ! -f "$FILE_PATH" ]; then
    echo -e "${RED}Error: File not found: $FILE_PATH${NC}"
    exit 1
  fi
  ORIGINAL_FILENAME=$(basename "$FILE_PATH")
  # Determine file type from extension
  EXTENSION="${FILE_PATH##*.}"
  case "$EXTENSION" in
    pdf|PDF)
      FILE_TYPE="pdf"
      ;;
    jpg|jpeg|png|gif|JPG|JPEG|PNG|GIF)
      FILE_TYPE="image"
      ;;
    *)
      FILE_TYPE="scan"
      ;;
  esac
fi

echo -e "${YELLOW}File:${NC} $FILE_PATH"
echo -e "${YELLOW}Type:${NC} $FILE_TYPE"
echo -e "${YELLOW}Original Filename:${NC} $ORIGINAL_FILENAME"
echo ""

# Encode file to base64 (remove newlines from base64 output)
echo "Encoding file to base64..."
if command -v base64 &> /dev/null; then
  FILE_BASE64=$(base64 -i "$FILE_PATH" 2>/dev/null || base64 "$FILE_PATH" | tr -d '\n')
else
  FILE_BASE64=$(cat "$FILE_PATH" | base64 | tr -d '\n')
fi

if [ -z "$FILE_BASE64" ]; then
  echo -e "${RED}Error: Failed to encode file${NC}"
  exit 1
fi

FILE_SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH" 2>/dev/null || echo "unknown")
echo -e "${GREEN}File encoded successfully (size: $FILE_SIZE bytes)${NC}"
echo ""

# Create JSON payload using jq, python, or printf (in order of preference)
TEMP_JSON=$(mktemp)
TITLE="Test Upload - $(date +%Y-%m-%d\ %H:%M:%S)"
UPLOADED_AT=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)

if command -v jq &> /dev/null; then
  # Use jq to properly construct JSON with escaped base64
  jq -n \
    --arg title "$TITLE" \
    --arg file "$FILE_BASE64" \
    --arg file_type "$FILE_TYPE" \
    --arg original_filename "$ORIGINAL_FILENAME" \
    --arg uploaded_at "$UPLOADED_AT" \
    --argjson file_size "$FILE_SIZE" \
    '{
      title: $title,
      file: $file,
      file_type: $file_type,
      original_filename: $original_filename,
      metadata: {
        test: true,
        uploaded_at: $uploaded_at,
        file_size: $file_size
      }
    }' > "$TEMP_JSON"
elif command -v python3 &> /dev/null; then
  # Use Python to properly construct JSON (pass variables as arguments to avoid shell expansion issues)
  python3 -c "
import json
import sys

title = sys.argv[1]
file_base64 = sys.argv[2]
file_type = sys.argv[3]
original_filename = sys.argv[4]
uploaded_at = sys.argv[5]
file_size = int(sys.argv[6])

payload = {
    'title': title,
    'file': file_base64,
    'file_type': file_type,
    'original_filename': original_filename,
    'metadata': {
        'test': True,
        'uploaded_at': uploaded_at,
        'file_size': file_size
    }
}
print(json.dumps(payload))
" "$TITLE" "$FILE_BASE64" "$FILE_TYPE" "$ORIGINAL_FILENAME" "$UPLOADED_AT" "$FILE_SIZE" > "$TEMP_JSON"
else
  # Fallback: use printf (base64 should be safe for JSON strings)
  printf '{
  "title": "Test Upload - %s",
  "file": "%s",
  "file_type": "%s",
  "original_filename": "%s",
  "metadata": {
    "test": true,
    "uploaded_at": "%s",
    "file_size": %s
  }
}' "$(date +%Y-%m-%d\ %H:%M:%S)" "$FILE_BASE64" "$FILE_TYPE" "$ORIGINAL_FILENAME" "$UPLOADED_AT" "$FILE_SIZE" > "$TEMP_JSON"
fi

echo -e "${YELLOW}Sending request to:${NC} $ENDPOINT"
echo ""

# Send request using temp file (most reliable method)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "@$TEMP_JSON")

# Cleanup temp file
rm -f "$TEMP_JSON"

# Split response and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo -e "${YELLOW}HTTP Status Code:${NC} $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
  echo -e "${GREEN}✓ Upload successful!${NC}"
  echo ""
  echo -e "${YELLOW}Response:${NC}"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo -e "${RED}✗ Upload failed${NC}"
  echo ""
  echo -e "${YELLOW}Response:${NC}"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
fi

# Cleanup test file if we created it
if [ -n "$TEST_FILE" ] && [ -f "$TEST_FILE" ]; then
  echo ""
  echo -e "${YELLOW}Cleaning up test file...${NC}"
  rm "$TEST_FILE"
fi

echo ""
echo "================================"
echo -e "${YELLOW}Test completed${NC}"

