# Testing the Backend Services

## Prerequisites

1. **Install dependencies:**
   ```bash
   cd apps/backend-services
   npm install
   ```

2. **Create a `.env` file** (optional, defaults are used if not provided):
   ```env
   PORT=3002
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   DATABASE_API_URL=http://localhost:3001/api/documents
   STORAGE_PATH=./storage/documents
   RABBITMQ_URL=amqp://localhost:5672
   RABBITMQ_EXCHANGE=document_upload
   RABBITMQ_ROUTING_KEY=document.uploaded
   ```

## Starting the Service

```bash
# From the backend services directory
npm run start:dev

# Or from the root directory
npm run dev:backend-services
```

The service will start on `http://localhost:3002` (or the port specified in `.env`).

## Testing Methods

### Method 1: Using cURL

#### Create a test file and encode it to base64:

```bash
# Create a simple test file
echo "This is a test PDF content" > test.pdf

# Encode to base64 (Linux/Mac)
FILE_BASE64=$(base64 -i test.pdf)

# Or using cat (works on all platforms)
FILE_BASE64=$(cat test.pdf | base64)
```

#### Send the upload request:

```bash
curl -X POST http://localhost:3002/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Document",
    "file": "'"$FILE_BASE64"'",
    "file_type": "pdf",
    "original_filename": "test.pdf",
    "metadata": {
      "source": "test",
      "department": "IT"
    }
  }'
```

### Method 2: Using the Test Script

A test script is provided at `test-upload.sh` (see below).

### Method 3: Using Postman or Insomnia

1. Create a new POST request to `http://localhost:3002/api/upload`
2. Set headers: `Content-Type: application/json`
3. Use this body structure:
   ```json
   {
     "title": "Test Document",
     "file": "base64-encoded-file-content-here",
     "file_type": "pdf",
     "original_filename": "test.pdf",
     "metadata": {
       "key": "value"
     }
   }
   ```

### Method 4: Using Node.js Script

See `test-upload.js` for a Node.js test script.

## Expected Response

**Success Response (201 Created):**
```json
{
  "success": true,
  "document": {
    "id": "doc_1234567890_abc123",
    "title": "Test Document",
    "original_filename": "test.pdf",
    "file_type": "pdf",
    "file_size": 1024,
    "status": "pending",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": ["file must be a string", "file_type must be one of the following values: pdf, image, scan"],
  "error": "Bad Request"
}
```

## What to Check

1. **Service Logs**: You should see:
   - Database API call logs (stubbed)
   - Queue message publish logs (stubbed)
   - File storage confirmation

2. **File System**: Check the `storage/documents` directory (or path specified in `STORAGE_PATH`) for the uploaded file.

3. **Response**: Verify the response contains a document ID and correct metadata.

## Testing Different File Types

### PDF:
```json
{
  "title": "PDF Document",
  "file": "base64-content",
  "file_type": "pdf"
}
```

### Image:
```json
{
  "title": "Image Document",
  "file": "base64-content",
  "file_type": "image"
}
```

### Scan:
```json
{
  "title": "Scanned Document",
  "file": "base64-content",
  "file_type": "scan"
}
```

## Testing Error Cases

### Missing Required Fields:
```bash
curl -X POST http://localhost:3002/api/upload \
  -H "Content-Type: application/json" \
  -d '{"title": "Test"}'
```

### Invalid File Type:
```bash
curl -X POST http://localhost:3002/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "file": "base64content",
    "file_type": "invalid"
  }'
```

### Empty File:
```bash
curl -X POST http://localhost:3002/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "file": "",
    "file_type": "pdf"
  }'
```

## Verifying Stubbed Services

The service logs all stubbed operations. Check the console output for:
- `DatabaseService.createDocument (STUBBED)` - Database API call logs
- `QueueService.publishDocumentUploaded (STUBBED)` - RabbitMQ message logs

These show what would be sent to the real services.

