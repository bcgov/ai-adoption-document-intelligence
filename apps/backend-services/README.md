# Backend Services

NestJS REST API backend for the Document Intelligence Platform. Provides comprehensive document processing capabilities including OCR, workflow execution, document labeling, model training, and human-in-the-loop review.

## Overview

The backend services provide a modular, scalable API for:
- Document upload, storage, and metadata management
- Azure Document Intelligence OCR integration
- Graph-based workflow orchestration via Temporal.io
- Document labeling projects with custom field schemas
- Azure Document Intelligence custom model training
- Human-in-the-loop (HITL) review queue and correction tracking
- Multi-mode authentication (Keycloak SSO + API keys)
- Blob storage abstraction (MinIO/S3 or Azure Blob Storage, switchable via environment variable)

## Architecture

- **Framework**: NestJS with Express HTTP server
- **Database**: PostgreSQL with Prisma ORM
- **Workflow Engine**: Temporal.io for durable, distributed workflows
- **OCR**: Azure Document Intelligence (formerly Form Recognizer)
- **Storage**: Pluggable blob storage (MinIO/S3 or Azure Blob Storage, selected via `BLOB_STORAGE_PROVIDER` env var)
- **Authentication**: Keycloak OIDC/SSO + API Key authentication
- **API Documentation**: Swagger/OpenAPI at `/api`

## Modules

### Core Modules

#### `document/` - Document Management
- CRUD operations for documents
- Document status tracking (pre_ocr, ongoing_ocr, completed_ocr, failed)
- OCR result retrieval and key-value pair extraction
- Document approval workflow
- File download endpoints
- Integration with Temporal workflows and blob storage

**Key Endpoints:**
- `GET /api/documents` - List all documents with optional filters
- `GET /api/documents/:id` - Get document details
- `POST /api/documents/:id/approve` - Approve OCR results
- `GET /api/documents/:id/file` - Download original file
- `GET /api/documents/:id/ocr-result` - Get OCR results with key-value pairs

#### `upload/` - Document Upload
- File upload via base64-encoded or multipart/form-data
- Automatic OCR workflow triggering
- File type validation
- Metadata handling

**Key Endpoints:**
- `POST /api/upload` - Upload document and start OCR processing

#### `ocr/` - OCR Management
- Azure Document Intelligence integration
- Model listing (prebuilt and custom models)
- OCR processing coordination

**Key Endpoints:**
- `GET /api/models` - List available OCR models

#### `workflow/` - Workflow Configuration
- CRUD operations for graph-based workflow definitions
- Workflow versioning
- User-scoped workflow management
- Workflow execution via Temporal

**Key Endpoints:**
- `GET /api/workflows` - List user workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/:id` - Get workflow details
- `PUT /api/workflows/:id` - Update workflow
- `DELETE /api/workflows/:id` - Delete workflow

### Labeling & Training Modules

#### `labeling/` - Document Labeling
- Labeling project management
- Custom field schema definition (string, number, date, signature, selectionMark)
- Document-to-project assignment
- Bounding box label saving
- Label export for training

**Key Endpoints:**
- `GET /api/labeling/projects` - List projects
- `POST /api/labeling/projects` - Create project
- `GET /api/labeling/projects/:id` - Get project details
- `POST /api/labeling/projects/:id/fields` - Add field definition
- `POST /api/labeling/projects/:projectId/documents` - Add document to project
- `POST /api/labeling/projects/:projectId/documents/:docId/labels` - Save labels
- `GET /api/labeling/projects/:projectId/export` - Export labels for training

#### `training/` - Model Training
- Azure Document Intelligence custom model training
- Training data validation
- Training job management and monitoring
- Blob container creation and SAS URL generation
- Label file formatting (.labels.json)

**Key Endpoints:**
- `GET /api/training/projects/:projectId/validate` - Validate training readiness
- `POST /api/training/projects/:projectId/train` - Start training job
- `GET /api/training/projects/:projectId/jobs` - List training jobs
- `GET /api/training/jobs/:jobId` - Get job status
- `DELETE /api/training/jobs/:jobId` - Delete training job and resources

### Azure Classifier Module

#### `azure/` - Azure Classifier
- Document classifier management (create, train, classify)
- Wraps Azure Document Intelligence classifier APIs
- BlobService for container/blob lifecycle and SAS URL generation
- Group-scoped classifiers with PRETRAINING → TRAINING → READY lifecycle

**Key Endpoints:**
- `POST /api/azure/classifier` — Create classifier record
- `POST /api/azure/classifier/documents` — Upload training documents
- `DELETE /api/azure/classifier/documents` — Delete training documents (204)
- `POST /api/azure/classifier/train` — Start training job
- `GET /api/azure/classifier/train` — Poll training result
- `POST /api/azure/classifier/classify` — Classify a document
- `GET /api/azure/classifier/classify` — Poll classification result

### HITL (Human-in-the-Loop) Module

#### `hitl/` - Review & Correction
- Review queue management with filtering
- Review session tracking
- Field-level correction recording
- Confidence score tracking
- Escalation workflow
- Analytics and statistics

**Key Endpoints:**
- `GET /api/hitl/queue` - Get review queue with filters
- `GET /api/hitl/queue/stats` - Queue statistics
- `POST /api/hitl/sessions` - Start review session
- `POST /api/hitl/sessions/:id/corrections` - Submit corrections
- `POST /api/hitl/sessions/:id/approve` - Approve document
- `POST /api/hitl/sessions/:id/escalate` - Escalate for further review
- `GET /api/hitl/analytics` - Analytics data with filters

### Infrastructure Modules

#### `auth/` - Authentication
- Keycloak OIDC/SSO integration
- JWT token validation
- User context extraction
- Protected route decorators

#### `api-key/` - API Key Management
- API key generation and storage
- bcrypt-based key hashing
- API key authentication guard
- Last-used timestamp tracking

**Key Endpoints:**
- `GET /api/api-key` - Get user's API key info
- `POST /api/api-key` - Generate new API key
- `DELETE /api/api-key` - Revoke API key

#### `temporal/` - Temporal Client
- Temporal workflow client initialization
- Workflow execution (OCR, Graph workflows)
- Workflow status querying
- Search attribute management
- Workflow cancellation

#### `blob-storage/` - Storage Abstraction
- Pluggable storage interface (`BlobStorageInterface`)
- MinIO/S3 implementation (`MinioBlobStorageService`)
- Azure Blob Storage implementation (`AzureBlobProviderService`)
- Azure storage — always Azure, for DI model training (`AzureStorageService`)
- Dynamic module with runtime provider selection via `BLOB_STORAGE_PROVIDER`
- Operations: write, read, exists, delete, list, deleteByPrefix
- See [docs-md/BLOB_STORAGE.md](../../docs-md/BLOB_STORAGE.md) for full architecture docs

#### `database/` - Database Service
- Prisma client wrapper
- Database connection management
- Shared across all modules

#### `queue/` - Message Queue (Stub)
- Message queue integration interface
- Ready for RabbitMQ/SQS/Azure Service Bus integration

## Prerequisites

- **Node.js** 24+ and npm 10+
- **Docker** and **Docker Compose** (for PostgreSQL, MinIO, and Temporal)
- **Temporal Server** (local or cloud)
- **Azure Subscription** (for Document Intelligence and Blob Storage)
- **Keycloak** (optional, for SSO authentication)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the `apps/backend-services/` directory:

```env
# Server Configuration
PORT=3002
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/docintell

# Azure Document Intelligence (OCR)
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_API_KEY=<your-api-key>
AZURE_DOC_INTELLIGENCE_MODELS=prebuilt-layout,prebuilt-document,prebuilt-invoice

# Azure Blob Storage (for primary storage when BLOB_STORAGE_PROVIDER=azure, and always for training)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_STORAGE_ACCOUNT_NAME=<your-account-name>
AZURE_STORAGE_ACCOUNT_KEY=<your-account-key>
AZURE_STORAGE_CONTAINER=documents
AZURE_STORAGE_TRAINING_CONTAINER=training-data

# Blob Storage Provider Selection (minio or azure, default: minio)
BLOB_STORAGE_PROVIDER=minio

# MinIO Configuration (when BLOB_STORAGE_PROVIDER=minio)
MINIO_ENDPOINT=http://localhost:19000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_DOCUMENT_BUCKET=document-blobs

# Temporal Workflow Engine
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=ocr-processing

# Keycloak SSO (Optional)
SSO_AUTH_SERVER_URL=https://keycloak.example.com/auth/realms/standard/protocol/openid-connect
SSO_REALM=standard
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret

# Request Limits
BODY_LIMIT=50mb

# Rate Limiting — Global Default (all endpoints, via @nestjs/throttler)
THROTTLE_GLOBAL_TTL_MS=60000        # Time window in milliseconds (default: 60 000 = 1 minute)
THROTTLE_GLOBAL_LIMIT=100           # Max requests per IP per window (default: 100)

# Rate Limiting — Auth Endpoints (login, callback, logout)
THROTTLE_AUTH_TTL_MS=60000          # Time window in milliseconds (default: 60 000 = 1 minute)
THROTTLE_AUTH_LIMIT=10              # Max requests per IP per window (default: 10)

# Rate Limiting — Token Refresh Endpoint
THROTTLE_AUTH_REFRESH_TTL_MS=60000  # Time window in milliseconds (default: 60 000 = 1 minute)
THROTTLE_AUTH_REFRESH_LIMIT=5       # Max requests per IP per window (default: 5)

# API Key Failed-Attempt Throttling
API_KEY_MAX_FAILED_ATTEMPTS=20      # Max failed API key validations per IP before 429 (default: 20)
API_KEY_FAILED_WINDOW_MS=60000      # Tracking window in milliseconds (default: 60 000 = 1 minute)
API_KEY_SWEEP_INTERVAL_MS=60000     # Cleanup interval for stale records in milliseconds (default: 60 000)
```

### 3. Local Services (Docker Compose)

The project includes a `docker-compose.yml` for local development services (PostgreSQL and MinIO).

#### Prerequisites

- **Docker** and **Docker Compose** installed and running
- Ports `5432` (PostgreSQL), `19000` (MinIO API), and `19001` (MinIO Console) available

#### Starting Services

```bash
# From apps/backend-services/
docker compose up -d
```

This starts:
- **PostgreSQL** on port `5432`
- **MinIO** (S3-compatible blob storage) on port `19000` (API) and `19001` (web console)
- **minio-init** sidecar that auto-creates the `document-blobs` and `benchmark-outputs` buckets

#### MinIO Access

- **Web Console**: http://localhost:19001 — login with `minioadmin` / `minioadmin`
- **API Endpoint**: http://localhost:19000

#### Verifying MinIO

```bash
# Check container health
docker ps | grep ai-doc-intelligence-minio

# Check bucket initialization logs
docker compose logs minio-init
```

If `minio-init` failed (e.g., MinIO wasn't healthy in time), re-run it:

```bash
docker compose up minio-init
```

#### Troubleshooting MinIO

- **Port conflict**: The compose file maps MinIO's internal ports 9000/9001 to host ports 19000/19001. If those are taken, adjust the port mappings in `docker-compose.yml`.
- **Buckets missing**: Check `docker compose logs minio-init` — the init container depends on MinIO's healthcheck and will retry until ready.
- **Connection refused from app**: Ensure your `.env` has `MINIO_ENDPOINT=http://localhost:19000` (not port 9000).

### 4. Database Setup

This project uses Prisma with a shared schema located at `apps/shared/prisma/schema.prisma`.

```bash
# Generate Prisma client (writes to apps/backend-services/src/generated/)
npm run db:generate

# Run migrations
npm run db:migrate

# (Optional) Seed database
npm run db:seed

# (Optional) Open Prisma Studio for database GUI
npm run db:studio
```

**Important:** Migrations are stored in `apps/shared/prisma/migrations/` and are shared between `backend-services` and `temporal` apps.

### 5. Start Temporal Server

```bash
# Using Docker Compose (recommended for local development)
cd ../temporal
docker-compose up -d

# Verify Temporal is running
temporal server status
```

### 6. Run the Service

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3002`.

## API Documentation

Interactive Swagger/OpenAPI documentation is available once the server is running:

**Swagger UI:** http://localhost:3002/api

The API documentation includes:
- All endpoint definitions with request/response schemas
- Authentication requirements (Bearer token or API key)
- Example requests and responses
- Schema definitions for all DTOs

## Authentication

The API supports two authentication modes:

### 1. Keycloak SSO (Bearer Token)

Protected endpoints accept JWT bearer tokens from Keycloak:

```bash
curl -X GET http://localhost:3002/api/documents \
  -H "Authorization: Bearer <your-jwt-token>"
```

Use the `@KeycloakSSOAuth()` decorator on protected endpoints.

### 2. API Key

Protected endpoints accept API keys in the `x-api-key` header:

```bash
curl -X GET http://localhost:3002/api/documents \
  -H "x-api-key: <your-api-key>"
```

Use the `@ApiKeyAuth()` decorator on protected endpoints.

Most endpoints support both authentication methods for flexibility.

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

Integration tests validate end-to-end API flows including database and Temporal interactions.

```bash
# Run all integration tests
npm run test:int

# Run specific test suite
npm run test:int -- document.spec.ts

# Run graph workflow integration tests
npm run test:int:workflow

# Run with Temporal worker in same process
npm run test:int:workflow:with-worker
```

See [TESTING.md](./TESTING.md) for comprehensive testing documentation.

## Database Operations

```bash
# Generate Prisma client from shared schema
npm run db:generate

# Create a new migration
npm run db:migrate

# Check migration status
npm run db:status

# Reset database (WARNING: deletes all data)
npm run db:reset

# Open Prisma Studio (database GUI)
npm run db:studio

# Run seed script
npm run db:seed
```

## Project Structure

```
apps/backend-services/
├── src/
│   ├── api-key/              # API key authentication
│   │   ├── api-key.controller.ts
│   │   ├── api-key.service.ts
│   │   └── guards/           # API key guard
│   │
│   ├── azure/                # Azure Document Intelligence classifier
│   │   ├── azure.module.ts
│   │   ├── azure.controller.ts
│   │   ├── azure.service.ts
│   │   ├── blob.service.ts
│   │   ├── classifier.service.ts
│   │   └── dto/
│   │
│   ├── auth/                 # Keycloak SSO authentication
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── guards/           # JWT guard
│   │
│   ├── blob-storage/         # Storage abstraction
│   │   ├── blob-storage.interface.ts      # Interface & injection token
│   │   ├── blob-storage.module.ts         # Dynamic provider module
│   │   ├── minio-blob-storage.service.ts  # MinIO/S3 implementation
│   │   ├── azure-blob-provider.service.ts # Azure Blob provider (BlobStorageInterface)
│   │   └── azure-storage.service.ts       # Azure storage (containers, SAS)
│   │
│   ├── database/             # Prisma database module
│   │   └── database.service.ts
│   │
│   ├── document/             # Document CRUD
│   │   ├── document.controller.ts
│   │   ├── document.service.ts
│   │   └── dto/
│   │
│   ├── hitl/                 # Human-in-the-loop
│   │   ├── hitl.controller.ts
│   │   ├── hitl.service.ts
│   │   └── dto/
│   │
│   ├── labeling/             # Document labeling
│   │   ├── labeling.controller.ts
│   │   ├── labeling.service.ts
│   │   └── dto/
│   │
│   ├── ocr/                  # Azure Document Intelligence
│   │   ├── ocr.controller.ts
│   │   └── ocr.service.ts
│   │
│   ├── queue/                # Message queue (stub)
│   │   ├── queue.module.ts
│   │   └── queue.service.ts
│   │
│   ├── temporal/             # Temporal client
│   │   ├── temporal-client.service.ts
│   │   └── workflow-types.ts
│   │
│   ├── training/             # Model training
│   │   ├── training.controller.ts
│   │   ├── training.service.ts
│   │   └── dto/
│   │
│   ├── upload/               # Document upload
│   │   ├── upload.controller.ts
│   │   └── dto/
│   │
│   ├── workflow/             # Workflow configuration
│   │   ├── workflow.controller.ts
│   │   ├── workflow.service.ts
│   │   ├── graph-workflow-types.ts
│   │   └── dto/
│   │
│   ├── decorators/           # Custom decorators
│   │   └── custom-auth-decorators.ts
│   │
│   ├── utils/                # Shared utilities
│   ├── testUtils/            # Test utilities
│   │
│   ├── app.module.ts         # Root module
│   └── main.ts               # Application entrypoint
│
├── integration-tests/         # Integration test suites
│   ├── document.spec.ts
│   ├── upload.spec.ts
│   ├── graph-workflow-tests/
│   └── helpers/
│
├── prisma.config.ts          # Prisma configuration
├── nest-cli.json             # NestJS CLI config
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies
```

## Development Tips

### Adding a New Module

1. Generate module using NestJS CLI:
   ```bash
   nest generate module my-feature
   nest generate controller my-feature
   nest generate service my-feature
   ```

2. Add module to `app.module.ts`

3. Create DTOs in `my-feature/dto/`

4. Add Swagger decorators for API documentation

5. Write tests in `my-feature/*.spec.ts`

### Adding Database Models

1. Edit `apps/shared/prisma/schema.prisma`

2. Create migration:
   ```bash
   npm run db:migrate
   ```

3. Regenerate Prisma clients:
   ```bash
   npm run db:generate
   ```

4. Update services to use new models

### Working with Temporal Workflows

1. Define workflow in `apps/temporal/src/`

2. Register activity in activity registry

3. Use `TemporalClientService` to start workflows from backend

4. Query workflow status via `queryWorkflow()` method

## Deployment

Docker support:

```bash
# Build image
docker build -t backend-services -f Dockerfile .

# Run container
docker run -p 3002:3002 \
  -e DATABASE_URL="postgresql://..." \
  -e TEMPORAL_ADDRESS="temporal:7233" \
  backend-services
```

See `/deployments/openshift/kustomize/` for Kubernetes/OpenShift manifests.

## Troubleshooting

### Prisma Client Issues

If you see "Cannot find module '@generated/client'":

```bash
npm run db:generate
```

### Temporal Connection Errors

Ensure Temporal server is running:

```bash
cd ../temporal
docker-compose ps
```

### Azure Document Intelligence Errors

Verify environment variables:
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`

Test connectivity:
```bash
curl -X GET "$AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/documentintelligence/documentModels?api-version=2023-10-31-preview" \
  -H "Ocp-Apim-Subscription-Key: $AZURE_DOCUMENT_INTELLIGENCE_API_KEY"
```

## Documentation

- [API Documentation](../../docs-md/API.md)
- [HITL Architecture](../../docs-md/HITL_ARCHITECTURE.md)
- [Testing Guide](./TESTING.md)
- [Migration Guide](./MIGRATIONS.md)

## License

Apache License 2.0

