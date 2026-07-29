# Document Intelligence Platform

A comprehensive document intelligence platform for automated document processing, OCR, workflow orchestration, model training, and human-in-the-loop review. Built for enterprise-scale deployments with flexibility, security, and extensibility.

## Project Status

This platform is under active development with core capabilities implemented:

✅ **Operational Features:**
- Document upload and management
- Azure Document Intelligence OCR integration
- Graph-based workflow engine (DAG execution)
- Document labeling workspace
- Custom model training
- Document classification (Azure Document Intelligence classifier training and automated document type classification)
- Human-in-the-loop review queue
- Benchmarking system for workflow evaluation (datasets, ground truth, scheduled runs, baseline comparison)
- Suggestion system for custom classifier template training
- Multi-mode authentication (Keycloak SSO + API keys)
- Unified blob storage (MinIO for local dev, Azure Blob Storage for cloud)

🚧 **In Development:**
- Advanced workflow visual editor (read-only visualization currently available)
- Extended analytics and reporting
- Additional activity node types

## Architecture

The platform is built as a microservices architecture with five main components:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  Document Upload │ Workflow Builder │ Labeling │ HITL │ Benchmarking  │
└────────────┬────────────────────────────────────────────────────┘
             │ REST API
┌────────────▼────────────────────────────────────────────────────┐
│                    Backend Services (NestJS)                    │
│  Document │ Upload │ Workflow │ Training │ HITL │ Benchmark │ Auth  │
└─────┬──────────────┬───────────────┬───────────────────────┬────┘
      │              │               │                       │
      │   ┌──────────▼───────┐       │                       │
      │   │  Temporal Server │       │                       │
      │   └──────────┬───────┘       │                       │
      │              │               │                       │
      │   ┌──────────▼───────────┐   │                       │
      │   │   Temporal Worker    │   │                       │
      │   │  (Graph Workflows)   │   │                       │
      │   └──────────────────────┘   │                       │
      │                              │                       │
┌─────▼──────┐  ┌──────────────┐     │    ┌──────────────────▼─────┐
│ PostgreSQL │  │ Blob Storage │     │    │ Azure Document         │
│  (Prisma)  │  │ (Local/Azure)│     │    │ Intelligence (OCR)     │
└────────────┘  └──────────────┘     │    └────────────────────────┘
                                     │
                        ┌────────────▼─────────┐
                        │  Image Service       │
                        │  (Python/OpenCV)     │
                        └──────────────────────┘
```

### Components

1. **[Backend Services](apps/backend-services/)** - NestJS REST API
   - Document management and metadata
   - OCR orchestration via Azure Document Intelligence
   - Workflow configuration and execution
   - Labeling project management
   - Custom model training
   - Document classifier training and classification
   - HITL review queue and session management
   - Benchmarking system (datasets, runs, evaluators, baseline comparison)
   - Authentication (Keycloak SSO + API keys)

2. **[Frontend](apps/frontend/)** - React SPA
   - Document upload with drag-and-drop
   - Real-time processing queue
   - Workflow configuration (JSON editor + read-only React Flow visualization)
   - Canvas-based labeling workspace (React Konva)
   - HITL review interface
   - Settings and API key management

3. **[Temporal Worker](apps/temporal/)** - Workflow execution engine
   - Generic DAG workflow interpreter
   - Activity registry for extensible operations
   - Multi-page document processing with parallel execution
   - Durable workflow state management
   - Integration with backend services and OCR

4. **[Image Service](apps/image-service/)** - Python preprocessing
   - Noise reduction and denoising
   - Skew correction (rotational and perspective)
   - Orientation detection and correction
   - Image scaling and resizing
   - Color manipulation and positioning

5. **[Shared](apps/shared/)** - Common resources
   - Prisma database schema (shared by backend and temporal)
   - Database migrations
   - Type definitions

## Key Features

### Document Processing

**Upload & OCR**
- Multi-format support (PDF, images)
- Azure Document Intelligence integration
- Custom and prebuilt model selection
- Word-level bounding boxes with confidence scores
- Key-value pair extraction
- Multi-page document processing

**Graph Workflows**
- Graph workflow configuration via a form editor or raw JSON, with read-only React Flow visualization
- Graph node types: `activity`, `switch` (conditional), `map` (fan-out), `join`, `childWorkflow`, `pollUntil`, `humanGate`
- `activity` nodes invoke registered activity types (OCR submit/poll, blob read, data transform, classification, table lookup, and more)
- Conditional branching with expression evaluation and parallel fan-out/join
- Workflow versioning and configuration
- Temporal.io-powered durable execution

### Training & Labeling

**Document Labeling**
- Project-based organization
- Custom field schema definition (string, number, date, signature, selectionMark)
- Canvas-based bounding box annotation
- Multi-page document support
- Label export for training

**Custom Model Training**
- Azure Document Intelligence template training
- Training job management and monitoring
- Automated training data preparation
- Blob storage integration for datasets
- Trained model registry

### Human-in-the-Loop (HITL)

**Review Queue**
- Confidence threshold-based routing
- Queue filtering and statistics
- Document assignment to reviewers

**Review Sessions**
- Field-by-field validation interface
- Side-by-side document viewing with OCR overlays
- Correction tracking with action types (confirmed, corrected, flagged, deleted)
- Session state management (in_progress, approved, escalated, skipped)
- Analytics and performance metrics

### Security & Authentication

**Multi-Mode Authentication**
- Keycloak SSO/OIDC integration for interactive users
- API key authentication for programmatic access
- JWT bearer token validation
- Role-based access control ready

**Data Security**
- Pluggable storage backend (local/Azure Blob Storage)
- Database encryption support
- Audit trails for document access
- Session-based review tracking

## Tech Stack

### Backend
- **NestJS** - Modular backend framework
- **Express** - HTTP server (via @nestjs/platform-express)
- **Prisma** - Type-safe database ORM
- **PostgreSQL** - Primary database
- **TypeScript** - Type safety and modern JavaScript
- **Azure Document Intelligence SDK** - OCR integration
- **Azure Blob Storage SDK** - Cloud storage
- **Temporal.io Client** - Workflow orchestration client

### Frontend
- **React 19** - Modern UI library
- **TypeScript** - Full type safety
- **Vite** - Build tool and dev server
- **Mantine UI** - Component library
- **React Flow (@xyflow/react)** - Workflow visualization
- **React Konva** - Canvas-based labeling
- **React PDF** - PDF rendering
- **TanStack Query** - Data fetching and caching
- **Axios** - HTTP client

### Workflow Engine
- **Temporal.io** - Durable workflow execution
- **TypeScript** - Workflow and activity definitions
- **Prisma** - Database access from activities

### Image Processing
- **Python 3.12** - Modern Python
- **OpenCV (cv2)** - Image processing
- **NumPy** - Numerical operations

## Use Cases

The platform supports diverse document processing scenarios:

- **Form Processing** - Automated data extraction from structured forms
- **Invoice Processing** - Invoice data extraction and validation
- **Application Processing** - Government service applications (SDPR, etc.)
- **FOI Requests** - Freedom of Information document handling
- **Document Classification** - Automated routing based on document type
- **Multi-page Reports** - Processing and segmentation of large documents
- **Custom Workflows** - Domain-specific processing pipelines

## Prerequisites

Before setting up the development environment, ensure you have:

- **[Node.js](https://nodejs.org/)** 24.x or later (see `.nvmrc`; matches GitHub Actions and Docker builds)
- **[npm](https://www.npmjs.com/)** 10.x or later
- **[PostgreSQL](https://www.postgresql.org/)** 14+ (or Docker for containerized database)
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (required on Windows/Mac — includes Docker Compose; ensure it is running before any `docker` commands).
- **[Python](https://www.python.org/)** 3.12+ (optional, for image-service)
- **[uv](https://github.com/astral-sh/uv)** (optional, for Python dependency management)
- **[Git](https://git-scm.com/)** for version control
- **Temporal Server** (via Docker Compose or local installation)

**Windows developers:** Run all `npm` and Node-based commands (install, dev, migrate, seed, generate) in **WSL** (Ubuntu). Docker, Git, and VS Code can remain on Windows/PowerShell. WSL integrates with Docker Desktop automatically — enable it under Docker Desktop → Settings → Resources → WSL Integration.

To install WSL: open PowerShell as Administrator and run `wsl --install`, then restart. Install Node 24 in WSL via nvm (see step 1 below).

> **Performance note:** Running npm commands against `/mnt/c/...` (Windows filesystem mounted in WSL) is significantly slower due to cross-filesystem I/O. For best performance, clone the repo inside the WSL filesystem (e.g. `~/dev/ai-adoption-document-intelligence`) and open it in VS Code using the Remote - WSL extension.

**Azure Services (Optional):**
- Azure Document Intelligence subscription (for OCR)
- Azure Blob Storage account (for production storage)
- Keycloak or OIDC provider (for authentication)

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd ai-adoption-document-intelligence

# Node 24 (required — root package.json engines, CI, and Dockerfiles)
nvm install    # reads .nvmrc
nvm alias default 24
nvm use

# Install all dependencies (run in WSL on Windows)
npm run install:all
```

### 2. Configure Environment

Copy `.env.sample` to each app directory and fill in your values:

```bash
cp .env.sample apps/backend-services/.env
cp .env.sample apps/temporal/.env
cp .env.sample apps/frontend/.env
```

**Minimum required keys** to get the backend running and seeded:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_doc_intelligence?schema=public
SEED_USER_SUB=<Your GUID>@azureidir   # find this on the SSO integrations page
SEED_USER_EMAIL=<Email associated with your IDIR>
```

All other keys in `.env.sample` have working local defaults or are production-only. The sections below document the full set of available keys per app.

**`apps/backend-services/.env`** (required):

```env
# Server
PORT=3002
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_doc_intelligence?schema=public

# Azure Document Intelligence (OCR — endpoint without /documentintelligence suffix)
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_API_KEY=<your-api-key>
AZURE_DOC_INTELLIGENCE_MODELS=prebuilt-layout,prebuilt-document,prebuilt-invoice

# Blob Storage — MinIO for local dev, Azure for production
BLOB_STORAGE_PROVIDER=minio
MINIO_ENDPOINT=http://localhost:19000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_DOCUMENT_BUCKET=document-blobs

# Azure Blob Storage (production — required when BLOB_STORAGE_PROVIDER=azure)
# AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
# AZURE_STORAGE_ACCOUNT_NAME=<account-name>
# AZURE_STORAGE_ACCOUNT_KEY=<account-key>

# Temporal
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=ocr-processing

# Benchmarking
BENCHMARK_TASK_QUEUE=benchmark-processing
ENABLE_BENCHMARK_QUEUE=true

# Keycloak SSO (Optional)
# SSO_AUTH_SERVER_URL=https://keycloak.example.com/auth/realms/standard/protocol/openid-connect
# SSO_REALM=standard
# SSO_CLIENT_ID=your-client-id
# SSO_CLIENT_SECRET=your-client-secret
```

**Frontend Configuration** — edit `apps/frontend/.env`:

```env
VITE_API_BASE_URL=
VITE_APP_NAME=Document Intelligence Platform
VITE_APP_VERSION=1.0.0
```

Note: All OAuth/OIDC configuration is handled by the backend. The frontend has no OIDC settings.

**Temporal Worker Configuration** — edit `apps/temporal/.env`:

```env
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=ocr-processing
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_doc_intelligence?schema=public
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_API_KEY=<your-api-key>
BLOB_STORAGE_PROVIDER=minio
MINIO_ENDPOINT=http://localhost:19000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### 3. Start Infrastructure (Docker)

**Option A — VS Code `Dev: all` task **

   The `Dev: all` task starts Docker infrastructure, waits for all containers to be healthy, then starts the frontend, backend, and Temporal worker automatically on workspace open.

   **First-time setup:**
   1. Complete steps 3 and 4 first (Docker infra up, then migrate/seed from WSL)
   2. Enable automatic tasks: **Ctrl+Shift+P** → `Manage Automatic Tasks` → `Allow Automatic Tasks`
   3. Reload the window: **Ctrl+Shift+P** → `Developer: Reload Window` — this triggers `Dev: all`

   **Subsequent starts:** Just open VS Code (or reload the window) — `Dev: all` handles Docker and all services automatically. Steps 3 and 4 do not need to be repeated unless the database is reset.

> **Options B/C (command line):** Run the following manually in PowerShell or WSL:

```bash
docker compose --profile infra --profile temporal up -d
# Starts: postgres, minio, temporal-postgresql, minio-init, temporal, temporal-ui
```

Verify all containers are healthy:

```bash
docker ps
```

| Service       | Host Port |
|---------------|-----------|
| PostgreSQL    | 5432      |
| MinIO API     | 19000     |
| MinIO Console | 19001     |
| Temporal      | 7233      |
| Temporal UI   | 8088      |

- http://localhost:8088 — Temporal UI
- http://localhost:19001 — MinIO Console (user: `minioadmin` / `minioadmin`)

### 4. Database Setup (run once before starting services)

Requires only PostgreSQL to be running (Docker infra from step 3) — the backend and frontend do not need to be started yet. Run in WSL on Windows:

```bash
# Apply all pending migrations
npm run db:migrate

# Generate the Prisma TypeScript client
npm run db:generate

# Seed reference data (recommended)
# Login creates a user automatically from the Keycloak JWT, so seeding is not required
# for authentication itself. However, without seeding: group-gated features may be blocked,
# the seeded API key will not exist, and template models / benchmark reference data will be missing.
npm run db:seed
```

**Verify the seed ran correctly** — open Prisma Studio:

```bash
cd apps/backend-services
npm run db:studio   # opens http://localhost:5555
```

In the `user` table you should see 3 rows; `group` should have 1 row; `api_key` should have 1 row; `template_model` should have several rows. If you only see 1 user and no group/api_key rows, the seed did not run with a valid `SEED_USER_SUB`.

### 5. Start Services

**Option A — VS Code `Dev: all` task **

if Dev:all task has run, then skip this step 

**Option B — All services via command line (WSL)**

```bash
# From repo root — starts backend, frontend, and temporal worker
npm run dev
```

**Option C — Start services individually (WSL)**

```bash
# Terminal 1: Backend
npm run dev:backend      # http://localhost:3002

# Terminal 2: Frontend
npm run dev:frontend     # http://localhost:3000

# Terminal 3: Temporal Worker
cd apps/temporal && npm run dev

```

### 6. Access the Application

- **Frontend**: http://localhost:3000
- **Swagger API Docs**: http://localhost:3002/api
- **Temporal UI**: http://localhost:8088
- **Prisma Studio**: `cd apps/backend-services && npm run db:studio`


## Development Workflow

### Database Management

```bash
cd apps/backend-services

# Generate Prisma client from schema
npm run db:generate

# Create a new migration
npm run db:migrate

# Check migration status
npm run db:status

# Reset database (WARNING: deletes all data)
npm run db:reset

# Open Prisma Studio (GUI)
npm run db:studio

# Seed database with sample data
npm run db:seed
```

**Important**: The Prisma schema is shared at `apps/shared/prisma/schema.prisma`. Migrations are stored in `apps/shared/prisma/migrations/` and apply to both `backend-services` and `temporal` apps.

### Running Tests

**Backend Integration Tests:**

```bash
cd apps/backend-services

# Run all integration tests
npm run test:int

# Run specific test suite
npm run test:int -- document.spec.ts

# Run graph workflow integration tests
npm run test:int:workflow

# Run with Temporal worker in same process
npm run test:int:workflow:with-worker
```

**Unit Tests:**

```bash
cd apps/backend-services
npm test

cd apps/temporal
npm test
```

### Code Quality

```bash
# Lint entire monorepo
npm run lint

# Lint and auto-fix
cd apps/backend-services
npm run lint:fix

cd apps/frontend
npm run lint:fix
```

### Building for Production

```bash
# Build all services
npm run build

# Build individually
npm run build:backend-services
npm run build:frontend

cd apps/temporal
npm run build
```

## Project Structure

```
ai-adoption-document-intelligence/
├── apps/
│   ├── backend-services/          # NestJS REST API
│   │   ├── src/
│   │   │   ├── actor/            # API key management (controller, service, DB)
│   │   │   ├── auth/             # Keycloak SSO, JWT guards, API key auth guard
│   │   │   ├── azure/            # Azure Document Intelligence classifiers
│   │   │   ├── benchmark/        # Benchmarking system
│   │   │   ├── blob-storage/     # Storage abstraction (MinIO/Azure)
│   │   │   ├── database/         # Prisma database service
│   │   │   ├── document/         # Document management
│   │   │   ├── group/            # Groups, membership, authorization
│   │   │   ├── hitl/             # Human-in-the-loop
│   │   │   ├── ocr/              # OCR model listing
│   │   │   ├── tables/           # Group-scoped lookup tables
│   │   │   ├── template-model/   # Template models + labeling documents/labels
│   │   │   ├── temporal/         # Temporal client
│   │   │   ├── training/         # Custom model training jobs
│   │   │   ├── upload/           # File upload + workflow kickoff
│   │   │   ├── workflow/         # Workflow configuration
│   │   │   └── app.module.ts    # Root module
│   │   ├── integration-tests/    # Integration tests
│   │   ├── Dockerfile           # Production image
│   │   └── package.json
│   │
│   ├── frontend/                 # React application
│   │   ├── src/
│   │   │   ├── auth/            # Authentication context
│   │   │   ├── components/      # Reusable components
│   │   │   ├── data/            # API services & hooks
│   │   │   ├── features/
│   │   │   │   ├── annotation/  # Labeling & HITL
│   │   │   │   └── benchmarking/ # Benchmarking UI
│   │   │   ├── pages/           # Main pages
│   │   │   ├── shared/          # Utilities & types
│   │   │   └── App.tsx          # App shell
│   │   ├── vite.config.ts       # Vite configuration
│   │   ├── Dockerfile           # Production nginx image
│   │   └── package.json
│   │
│   ├── temporal/                 # Temporal worker
│   │   ├── src/
│   │   │   ├── activities.ts    # Activity implementations
│   │   │   ├── activity-registry.ts  # Dynamic activity loader
│   │   │   ├── graph-workflow.ts     # DAG executor
│   │   │   ├── graph-engine/    # Graph evaluation
│   │   │   └── worker.ts        # Worker entrypoint
│   │   └── package.json
│   │
│   ├── image-service/            # Python image preprocessing
│   │   ├── tools/
│   │   │   ├── noise.py         # Noise reduction
│   │   │   ├── skew.py          # Skew correction
│   │   │   ├── orientation.py   # Rotation detection
│   │   │   ├── size.py          # Scaling/resizing
│   │   │   ├── colour.py        # Color manipulation
│   │   │   └── positioning.py   # Alignment
│   │   ├── main.py              # Test script
│   │   └── pyproject.toml
│   │
│   └── shared/                   # Shared resources
│       ├── prisma/
│       │   ├── schema.prisma    # Database schema
│       │   └── migrations/      # DB migrations
│       └── scripts/
│           └── generate-prisma.js
│
├── docker-compose.yml            # Local infra (postgres, minio, temporal, optional app stack)
├── deployments/
│   └── openshift/
│       └── kustomize/           # Kubernetes manifests
│
├── docs/                         # Generated documentation site
├── docs-md/                      # Technical documentation
│   ├── BLOB_STORAGE.md          # Storage architecture
│   ├── HITL_ARCHITECTURE.md     # HITL system design
│   ├── TEMPLATE_MODELS.md       # Template models & training guide
│   ├── ground-truth-generation.md # Benchmark ground truth
│   ├── hitl-dataset-creation.md # HITL dataset creation
│   └── graph-workflows/         # Workflow engine docs
│       ├── DAG_WORKFLOW_ENGINE.md
│       ├── ADDING_GRAPH_NODES_AND_ACTIVITIES.md
│       └── GRAPH_TYPES.md
│
├── feature-docs/                 # Feature specifications
├── CLAUDE.md                     # Development guidelines
├── LICENSE                       # Apache 2.0
└── package.json                  # Root workspace config
```

## API Documentation

Interactive API documentation is available via Swagger/OpenAPI once the backend is running:

**Swagger UI:** http://localhost:3002/api

The API includes endpoints for:

- **Documents** (`/api/documents`) - CRUD operations, OCR results, file download
- **Upload** (`/api/upload`) - Document upload with OCR processing
- **Workflows** (`/api/workflows`) - Workflow configuration management
- **Template Models** (`/api/template-models`) - Template models, labeling documents/labels, and custom model training jobs
- **HITL** (`/api/hitl`) - Review queue, sessions, corrections, analytics
- **Azure Classifier** (`/api/azure/classifier`) - Classifier lifecycle management (create, train, classify)
- **Benchmarking** (`/api/benchmark`) - Projects, datasets, definitions, runs, evaluators, ground truth
- **Groups** (`/api/groups`) - Group management, membership, and authorization
- **Tables** (`/api/tables`) - Group-scoped lookup/reference tables
- **API Keys** (`/api/api-key`) - API key generation and management
- **Models** (`/api/models`) - Available OCR models

### Authentication

The API supports two authentication modes:

**1. Keycloak SSO (Interactive Users)**

Uses OpenID Connect flow with JWT bearer tokens:

```bash
curl -X GET http://localhost:3002/api/documents \
  -H "Authorization: Bearer <jwt-token>"
```

**2. API Key (Programmatic Access)**

Generate API keys from Settings page, use in `x-api-key` header:

```bash
# Generate API key (via UI or authenticated endpoint)
curl -X POST http://localhost:3002/api/api-key \
  -H "Authorization: Bearer <jwt-token>"

# Use API key for requests
curl -X POST http://localhost:3002/api/upload \
  -H "x-api-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Invoice",
    "file": "<base64-encoded-file>",
    "file_type": "pdf",
    "model_id": "prebuilt-invoice"
  }'
```

**API Key Management:**
- One API key per group (group-scoped; a user may hold keys for multiple groups)
- Generate from Settings page (single-use display)
- Keys stored as bcrypt hashes
- No expiration
- Revocable via Settings or DELETE endpoint

## Workflows

The platform uses Temporal.io for durable, graph-based workflow execution.

### Graph Workflow Engine

Execute custom document processing workflows as Directed Acyclic Graphs (DAGs), interpreted at runtime by a Temporal workflow (cycles are rejected via topological validation):

**Workflow Capabilities:**
- Configure workflows via a form editor or raw JSON, with a read-only React Flow visualization
- Parallel execution branches with join points
- Expression-based conditional routing
- Error handling and retry policies
- Workflow versioning

**Graph Node Types:**

| Node Type | Purpose |
|-----------|---------|
| `activity` | Run a registered activity (OCR, blob read, transform, classify, table lookup, etc.) |
| `switch` | Conditional branching via expression evaluation |
| `map` | Fan out over a collection for parallel processing |
| `join` | Merge parallel branches |
| `childWorkflow` | Invoke a child workflow |
| `pollUntil` | Poll an activity until a condition is met |
| `humanGate` | Pause for human-in-the-loop input |

`activity` nodes invoke activity types from the worker's activity registry (for example `azureOcr.submit`, `azureOcr.poll`, `blob.read`, `data.transform`, `document.*`, `azureClassify.*`, `tables.lookup`). See the engine docs and node catalog for the full list.

**Creating Workflows:**
1. Navigate to the Workflows page in the UI
2. Create a workflow using the form editor or raw JSON configuration
3. Define nodes, edges, and parameters
4. Save the workflow (receives a unique ID)
5. Select the workflow during document upload

See [docs-md/workflows/DAG_WORKFLOW_ENGINE.md](docs-md/workflows/DAG_WORKFLOW_ENGINE.md) and [docs-md/workflows/WORKFLOW_NODE_CATALOG.md](docs-md/workflows/WORKFLOW_NODE_CATALOG.md) for complete documentation.

## Document Labeling & Training

Train custom Azure Document Intelligence models for specialized document types.

### Labeling Workflow

1. **Create Template Model** - Define custom field schema
   - Field types: string, number, date, signature, selectionMark
   - Field ordering and display configuration

2. **Upload Documents** - Add training documents to the template model
   - Supports PDF and image formats
   - Multi-page documents supported

3. **Label Fields** - Annotate documents with bounding boxes
   - Canvas-based drawing interface
   - Associate boxes with field definitions
   - Multi-page navigation

4. **Export Labels** - Generate training dataset
   - Creates `.labels.json` files (Azure format)
   - Exports to Azure Blob Storage container

5. **Train Model** - Start training job
   - Validation checks (minimum documents, labels)
   - Uploads to Azure Blob Storage
   - Initiates Azure Document Intelligence training
   - Monitors job status

6. **Use Model** - Apply trained model to new documents
   - Model receives unique `model_id`
   - Select in upload or workflow configuration
   - Higher accuracy for domain-specific fields

See [docs-md/architecture/TEMPLATE_MODELS.md](docs-md/architecture/TEMPLATE_MODELS.md) for the complete template models and training guide.

## Human-in-the-Loop (HITL)

Validate and correct OCR results through human review.

### Review Queue System

**Queue Management:**
- Documents automatically enter queue after OCR
- Filtering by status, document type, confidence threshold
- Statistics dashboard (pending, approved, escalated)
- Reviewer assignment

**Review Session:**
- One document, one reviewer, one session
- Field-by-field review interface
- Side-by-side document view with OCR overlays
- Confidence scores displayed
- Correction actions: confirmed, corrected, flagged, deleted

**Session States:**
- `in_progress` - Active review
- `approved` - Review completed, results approved
- `escalated` - Requires additional review
- `skipped` - Deferred for later

**Analytics:**
- Field accuracy rates
- Review throughput
- Confidence distribution
- Correction patterns

See [docs-md/architecture/HITL_ARCHITECTURE.md](docs-md/architecture/HITL_ARCHITECTURE.md) for architecture details.

## Benchmarking

Evaluate and track document intelligence workflow performance over time.

**Core Capabilities:**
- **Datasets & Ground Truth** - Create benchmark datasets from HITL-reviewed documents with versioned ground truth
- **Pluggable Evaluators** - Registry of evaluators (schema-aware and black-box) for comparing extraction results against ground truth
- **Benchmark Runs** - Execute evaluations across dataset samples, orchestrated as Temporal workflows with per-sample child workflows
- **Scheduled Runs** - Cron-based scheduling via Temporal for automated regression detection
- **Statistical Aggregation** - Mean, median, stdDev, percentiles (p5/p25/p75/p95), per-field error breakdown, and worst-sample identification
- **Baseline Comparison** - Pin a run as baseline, compare subsequent runs with absolute/relative thresholds, automatic regression flagging
- **Audit Logging** - Track benchmark lifecycle events (dataset created, run started/completed, baseline promoted)

See [https://bcgov.github.io/ai-adoption-document-intelligence/benchmarking-guide.html](https://bcgov.github.io/ai-adoption-document-intelligence/benchmarking-guide.html) and [https://bcgov.github.io/ai-adoption-document-intelligence/benchmarking-technical.html](https://bcgov.github.io/ai-adoption-document-intelligence/benchmarking-technical.html) for detailed documentation.

## Deployment

### Docker

Each service includes a Dockerfile for containerized deployment:

```bash
# Backend Services
cd apps/backend-services
docker build -t backend-services .
docker run -p 3002:3002 \
  -e DATABASE_URL="postgresql://..." \
  -e TEMPORAL_ADDRESS="temporal:7233" \
  backend-services

# Frontend
cd apps/frontend
docker build -t frontend .
docker run -p 80:80 frontend

# Temporal Worker
cd apps/temporal
docker build -t temporal-worker .
docker run \
  -e TEMPORAL_ADDRESS="temporal:7233" \
  -e DATABASE_URL="postgresql://..." \
  temporal-worker
```

### OpenShift/Kubernetes

Kubernetes manifests are provided in `deployments/openshift/kustomize/`:

```bash
# Apply to cluster
kubectl apply -k deployments/openshift/kustomize/overlays/dev
```

**Features:**
- Database migration init containers
- ConfigMap and Secret management
- PostgreSQL CrunchyDB integration
- Horizontal pod autoscaling
- Health check probes
- Network policies

See [apps/backend-services/MIGRATIONS.md](apps/backend-services/MIGRATIONS.md) for database migration details.

### Environment Variables

**Backend Services:**
```env
# Core
PORT=3002
NODE_ENV=production
FRONTEND_URL=https://app.example.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Azure Document Intelligence (endpoint without /documentintelligence suffix)
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://...
AZURE_DOCUMENT_INTELLIGENCE_API_KEY=...

# Blob Storage (azure for production)
BLOB_STORAGE_PROVIDER=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpoints...
AZURE_STORAGE_ACCOUNT_NAME=...
AZURE_STORAGE_ACCOUNT_KEY=...

# Temporal
TEMPORAL_ADDRESS=temporal:7233
TEMPORAL_NAMESPACE=default

# Benchmarking
BENCHMARK_TASK_QUEUE=benchmark-processing
ENABLE_BENCHMARK_QUEUE=true

# Authentication
SSO_AUTH_SERVER_URL=https://keycloak.example.com/auth/realms/standard/protocol/openid-connect
SSO_REALM=standard
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret
```

**Frontend:**
```env
VITE_API_BASE_URL=https://api.example.com
```

Note: All OAuth/OIDC configuration is handled by the backend. The frontend has no OIDC settings.

## Documentation

### Repo Wiki

- **[Repo Wiki](docs-md/wiki/index.md)** - Compact map for humans and LLMs: find canonical docs and code paths before editing; start here when exploring the codebase.

### Core Documentation

- **[HITL Architecture](docs-md/architecture/HITL_ARCHITECTURE.md)** - Human-in-the-loop system design
- **[Template Models](docs-md/architecture/TEMPLATE_MODELS.md)** - Template models and custom model training guide
- **[Blob Storage](docs-md/architecture/BLOB_STORAGE.md)** - Storage architecture (MinIO/Azure)
- **[Benchmarking Guide](https://bcgov.github.io/ai-adoption-document-intelligence/benchmarking-guide.html)** - Benchmarking system usage
- **[Benchmarking Technical](https://bcgov.github.io/ai-adoption-document-intelligence/benchmarking-technical.html)** - Benchmarking architecture and internals

### Workflow Documentation

- **[DAG Workflow Engine](docs-md/workflows/DAG_WORKFLOW_ENGINE.md)** - Workflow engine specification
- **[Adding Nodes & Activities](docs-md/workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md)** - Extend workflow capabilities
- **[Graph Types](docs-md/workflows/GRAPH_TYPES.md)** - Type definitions

### Service Documentation

- **[Backend Services README](apps/backend-services/README.md)** - API service documentation
- **[Frontend README](apps/frontend/README.md)** - UI application documentation
- **[Temporal README](apps/temporal/README.md)** - Workflow worker documentation
- **[Image Service README](apps/image-service/README.md)** - Image preprocessing documentation

### Development Guides

- **[Testing Guide](apps/backend-services/TESTING.md)** - Integration and unit testing
- **[Migrations Guide](apps/backend-services/MIGRATIONS.md)** - Database migration management
- **[Development Guidelines](CLAUDE.md)** - Coding standards and practices

## Compliance & Security

The platform is designed for enterprise and government deployments:

**Privacy & Data Protection:**
- FOIPPA compliance (BC Freedom of Information and Protection of Privacy Act)
- Canadian data residency requirements
- Configurable data retention policies
- Audit trails for document access

**Security:**
- Multi-mode authentication (SSO + API keys)
- JWT token validation
- bcrypt password/key hashing
- Role-based access control ready
- HTTPS/TLS enforcement in production
- Database encryption support
- Secure credential management

**Accessibility:**
- WCAG 2.1 AA standards compliance target
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode

**Standards:**
- BC Government security standards
- RESTful API design
- OpenAPI/Swagger documentation
- Semantic versioning

## Troubleshooting

### Common Issues

**Database Connection Errors:**
```bash
# Check PostgreSQL is running
docker ps

# Verify connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL
```

**Temporal Connection Errors:**
```bash
# Check Temporal server
docker compose --profile temporal ps

# Verify temporal CLI
temporal server status --address localhost:7233
```

**Prisma Client Not Found:**
```bash
# Regenerate Prisma client
cd apps/backend-services
npm run db:generate
```

**Authentication Issues:**
- Verify OIDC environment variables match Keycloak configuration
- Check redirect URIs in Keycloak client settings
- Inspect browser console for OIDC errors
- Verify backend CORS settings allow frontend origin

**Azure OCR Errors:**
```bash
# Test Azure connection
curl "$AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/documentintelligence/documentModels?api-version=2023-10-31-preview" \
  -H "Ocp-Apim-Subscription-Key: $AZURE_DOCUMENT_INTELLIGENCE_API_KEY"
```

### Logs

**Backend:**
```bash
# Development
cd apps/backend-services
npm run start:dev  # Output to console

# Production
docker logs <container-id>
```

**Frontend:**
```bash
# Browser console (F12)
# Network tab for API requests
```

**Temporal:**
```bash
# Worker logs
cd apps/temporal
npm run dev

# Temporal UI: http://localhost:8088
```

## Contributing

### Development Guidelines

See [CLAUDE.md](CLAUDE.md) for comprehensive development guidelines, including:

- No backwards compatibility features
- Strong typing (avoid `any` types)
- Test coverage requirements
- No placeholder implementations
- Documentation requirements
- Generic design principles

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Run linting: `npm run lint`
4. Run tests: `npm run test` and `npm run test:int`
5. Update documentation as needed
6. Submit pull request with clear description
7. Address review feedback
8. Merge after approval

### Code Quality

```bash
# Lint all code
npm run lint

# Auto-fix linting issues
cd apps/backend-services && npm run lint:fix
cd apps/frontend && npm run lint:fix

# Run tests
cd apps/backend-services && npm test
cd apps/backend-services && npm run test:int
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support & Contact

For questions, issues, or contributions:

- **Issues:** GitHub Issues
- **Documentation:** `/docs-md` directory
- **API Documentation:** http://localhost:3002/api (when running)