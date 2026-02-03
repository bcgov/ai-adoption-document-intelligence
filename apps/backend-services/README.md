# Backend Services

NestJS backend services for the AI OCR pipeline. Handles document uploads via REST API, stores files to local filesystem, and integrates with database API.

## Features

- REST API endpoint for document uploads (base64-encoded files)
- Local filesystem storage with UUID-based naming
- Stubbed database API integration
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

# Temporal Configuration
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=ocr-processing

# Database (for Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### 3. Database Setup (Prisma)

This project uses Prisma with a shared schema located at `apps/shared/prisma/schema.prisma`. The Prisma client is generated locally in this app.

#### Generate Prisma Client

```bash
npm run db:generate
```

This will:
- Read the shared schema from `apps/shared/prisma/schema.prisma`
- Generate the Prisma client locally in `src/generated/`
- The client is automatically generated before builds

#### Database Migrations

```bash
# Create a new migration
npm run db:migrate

# Check migration status
npm run db:status

# Reset database (WARNING: deletes all data)
npm run db:reset

# Open Prisma Studio (database GUI)
npm run db:studio
```

> **Note**: Migrations are stored in `apps/shared/prisma/migrations/` and are shared between `backend-services` and `temporal` apps. The schema is the single source of truth for both applications.

#### Prisma Commands

- `npm run db:generate` - Generate Prisma client from shared schema
- `npm run db:migrate` - Create and apply a new migration
- `npm run db:status` - Check migration status
- `npm run db:reset` - Reset database (deletes all data)
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run db:seed` - Run database seed script

### 4. Run the Service

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

Replace the stubbed implementations when ready to integrate with actual services.

