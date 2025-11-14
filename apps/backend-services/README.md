# Backend Services

NestJS backend services for the AI OCR pipeline. Handles document uploads via REST API, stores files to local filesystem, and integrates with database API and message queue (stubbed).

## Features

- REST API endpoint for document uploads (base64-encoded files)
- Local filesystem storage with UUID-based naming
- Stubbed database API integration
- Stubbed RabbitMQ message queue integration
- File type validation
- Comprehensive error handling and logging

## Prerequisites

- Node.js 22+
- npm 9+

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the backend services directory:

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

### 3. Run the Service

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## API Endpoints

### POST /api/upload

Upload a document with base64-encoded file data.

**Request Body:**
```json
{
  "title": "Document Title",
  "file": "base64-encoded-file-data",
  "file_type": "pdf|image|scan",
  "original_filename": "document.pdf",
  "metadata": {
    "key": "value"
  }
}
```

**Response:**
```json
{
  "success": true,
  "document": {
    "id": "doc_1234567890_abc123",
    "title": "Document Title",
    "original_filename": "document.pdf",
    "file_type": "pdf",
    "file_size": 1024,
    "status": "pending",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

## Architecture

- **Framework**: NestJS with Fastify
- **Database**: Stubbed API client (ready for HTTP client integration)
- **Message Queue**: Stubbed RabbitMQ interface (ready for amqplib integration)
- **File Storage**: Local filesystem (can be upgraded to S3/object storage)

## Testing

See [TESTING.md](./TESTING.md) for comprehensive testing instructions.

### Quick Test

1. **Start the service:**
   ```bash
   npm run start:dev
   ```

2. **Use the test script:**
   ```bash
   # Using bash script
   ./test-upload.sh path/to/your/file.pdf
   
   # Using Node.js script
   node test-upload.js path/to/your/file.pdf
   ```

3. **Or use cURL:**
   ```bash
   FILE_BASE64=$(base64 -i yourfile.pdf)
   curl -X POST http://localhost:3002/api/upload \
     -H "Content-Type: application/json" \
     -d "{
       \"title\": \"Test Document\",
       \"file\": \"$FILE_BASE64\",
       \"file_type\": \"pdf\",
       \"original_filename\": \"yourfile.pdf\"
     }"
   ```

## Development

The service uses stubbed implementations for:
- Database operations (API calls logged, ready for HTTP client)
- RabbitMQ message publishing (logged, ready for amqplib)

Replace the stubbed implementations when ready to integrate with actual services.

