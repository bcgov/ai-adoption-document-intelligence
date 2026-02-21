# Document Intelligence Platform

A comprehensive document intelligence platform for automated document processing, OCR, labeling, training, and human-in-the-loop review workflows.

## Architecture Overview

This is a microservices monorepo containing:

- **[backend-services/](./backend-services/)** - NestJS REST API for document management, OCR, workflows, labeling, training, and HITL
- **[frontend/](./frontend/)** - React/Vite UI with Mantine components for document processing and workflow management
- **[temporal/](./temporal/)** - Temporal.io worker for executing graph-based document processing workflows
- **[image-service/](./image-service/)** - Python/OpenCV service for image preprocessing (denoising, deskewing, rotation, resizing)
- **[shared/](./shared/)** - Shared Prisma database schema and configuration used by backend-services and temporal

## Key Features

### Document Processing
- 📄 **Document Upload & Management** - Multi-format document ingestion (images, PDFs)
- 🔍 **OCR (Optical Character Recognition)** - Azure Document Intelligence integration
  - Image/PDF text extraction with word-level bounding boxes
  - Multi-page document analysis
  - Confidence scoring and key-value pair extraction
  - Custom trained model support

### Workflow Engine
- 🔄 **Graph-Based Workflows** - DAG (Directed Acyclic Graph) workflow engine powered by Temporal.io
  - Visual workflow builder with node-based UI
  - Conditional logic and branching
  - Custom activity nodes (OCR, HTTP, Azure Blob, validation, transformation)
  - Workflow versioning and execution tracking

### Labeling & Training
- 🏷️ **Document Labeling** - Project-based document annotation system
  - Custom field schema definition (string, number, date, signature, selection marks)
  - Bounding box labeling with visual editor
  - Multi-document labeling workflows
- 🎓 **Model Training** - Azure Document Intelligence custom model training
  - Automated training data preparation
  - Azure Blob Storage integration for training datasets
  - Training job monitoring and status tracking

### Human-in-the-Loop (HITL)
- 👤 **Review Sessions** - Human validation and correction of OCR results
  - Field-level corrections with confidence scores
  - Review status tracking (approved, escalated, skipped)
  - Correction action logging (confirmed, corrected, flagged, deleted)

### Authentication & Security
- 🔐 **Multi-mode Authentication**
  - Keycloak SSO/OIDC integration
  - API Key authentication for programmatic access
  - JWT bearer token support
  - Role-based access control ready

### Storage & Infrastructure
- 💾 **Azure Blob Storage** - Scalable document storage
- 🗄️ **PostgreSQL** - Prisma ORM with comprehensive schema
- ⏱️ **Temporal.io** - Durable workflow execution engine
- 🎨 **Python Image Processing** - OpenCV-based preprocessing pipeline

## Tech Stack

### Backend Services (Node.js/TypeScript)
- **NestJS** - Modular backend framework
- **Fastify** - High-performance HTTP server
- **Prisma** - Type-safe database ORM
- **@azure-rest/ai-document-intelligence** - Azure OCR SDK
- **@azure/storage-blob** - Azure Blob Storage client
- **@temporalio/client** - Temporal workflow client
- **JWT/bcrypt** - Authentication and security
- **Swagger/OpenAPI** - API documentation

### Frontend (React/TypeScript)
- **React 19** - UI library
- **Vite** - Build tool and dev server
- **Mantine UI** - Component library
- **@xyflow/react** - Visual workflow graph editor
- **React Konva** - Canvas-based labeling editor
- **React PDF** - PDF rendering and annotation
- **TanStack Query** - Data fetching and state management
- **oidc-client-ts** - OpenID Connect authentication

### Temporal Worker (Node.js/TypeScript)
- **@temporalio/worker** - Workflow execution engine
- **@temporalio/workflow** - Workflow definitions
- **Prisma** - Database access from activities
- **Custom Activity Registry** - Dynamic activity loading

### Image Service (Python)
- **OpenCV (cv2)** - Image processing
- **NumPy** - Numerical operations
- Tools: noise reduction, skew correction, rotation, resizing, color manipulation, positioning

## Getting Started

### Prerequisites

- **Node.js** 24+ and npm 10+
- **PostgreSQL** 14+ (for Prisma database)
- **Temporal Server** (for workflow execution)
- **Python** 3.12+ (for image-service, optional)
- **Azure Subscription** (optional, for Document Intelligence and Blob Storage)

### Environment Setup

1. **Database Setup**
   ```bash
   # Configure PostgreSQL connection
   cp apps/shared/.env.sample apps/shared/.env
   # Edit DATABASE_URL in apps/shared/.env
   ```

2. **Backend Services Configuration**
   ```bash
   cp apps/backend-services/.env.example apps/backend-services/.env
   # Configure:
   # - DATABASE_URL (PostgreSQL)
   # - AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/KEY
   # - AZURE_STORAGE_CONNECTION_STRING
   # - TEMPORAL_ADDRESS
   # - KEYCLOAK_* settings (if using SSO)
   ```

3. **Temporal Configuration**
   ```bash
   cp apps/temporal/.env.example apps/temporal/.env
   # Configure:
   # - TEMPORAL_ADDRESS
   # - DATABASE_URL
   ```

### Installation

```bash
# Install root and workspace dependencies
npm run install:all

# Generate Prisma clients
cd apps/backend-services && npm run db:generate

# Run database migrations
cd apps/backend-services && npm run db:migrate
```

### Development

```bash
# Start all services concurrently
npm run dev

# Or start individually:
npm run dev:backend    # Backend API on port 3002
npm run dev:frontend   # Frontend on port 3000

# Start Temporal worker (in separate terminal)
cd apps/temporal && npm run dev

# Start Temporal server (if not running)
cd apps/temporal && docker-compose up

# Start image service (optional, in separate terminal)
cd apps/image-service && python -m main
```

### Building for Production

```bash
# Build all services
npm run build

# Or build individually:
npm run build:backend-services
npm run build:frontend
cd apps/temporal && npm run build
```

### Testing

```bash
# Backend integration tests
cd apps/backend-services
npm run test:int

# Graph workflow tests
npm run test:int:workflow

# Unit tests
npm test
```

## API Documentation

Once the backend is running, access interactive API documentation at:
- **Swagger UI**: http://localhost:3002/api

## Project Structure

```
apps/
├── backend-services/          # NestJS REST API
│   ├── src/
│   │   ├── api-key/          # API key authentication module
│   │   ├── auth/             # Keycloak SSO/JWT authentication
│   │   ├── blob-storage/     # Azure Blob Storage integration
│   │   ├── database/         # Prisma database module
│   │   ├── document/         # Document management CRUD
│   │   ├── hitl/             # Human-in-the-loop review sessions
│   │   ├── labeling/         # Document labeling projects
│   │   ├── ocr/              # Azure Document Intelligence OCR
│   │   ├── queue/            # Message queue integration (stub)
│   │   ├── temporal/         # Temporal workflow client
│   │   ├── training/         # Model training jobs
│   │   ├── upload/           # Document upload endpoints
│   │   ├── workflow/         # Workflow configuration CRUD
│   │   └── app.module.ts     # Root application module
│   ├── integration-tests/    # API integration tests
│   └── prisma.config.ts      # Prisma configuration
│
├── frontend/                  # React SPA
│   ├── src/
│   │   ├── auth/             # Authentication context & OIDC
│   │   ├── components/       # Reusable UI components
│   │   ├── features/         # Feature-specific components
│   │   ├── pages/            # Page-level components
│   │   ├── data/             # API clients & React Query
│   │   ├── shared/           # Shared utilities
│   │   └── types/            # TypeScript type definitions
│   └── vite.config.ts        # Vite build configuration
│
├── temporal/                  # Temporal worker
│   ├── src/
│   │   ├── activities.ts     # Activity implementations
│   │   ├── activity-registry.ts  # Dynamic activity loader
│   │   ├── graph-workflow.ts # DAG workflow executor
│   │   ├── graph-engine/     # Graph evaluation engine
│   │   └── worker.ts         # Worker entrypoint
│   └── docker-compose.yaml   # Local Temporal server
│
├── image-service/             # Python image preprocessing
│   ├── tools/
│   │   ├── noise.py          # Noise detection & denoising
│   │   ├── skew.py           # Rotational & perspective correction
│   │   ├── orientation.py    # Rotation angle detection
│   │   ├── size.py           # Image resizing & scaling
│   │   ├── colour.py         # Color manipulation
│   │   └── positioning.py    # Image alignment
│   └── main.py               # Service entrypoint
│
└── shared/                    # Shared resources
    ├── prisma/
    │   ├── schema.prisma     # Database schema
    │   └── migrations/       # Database migrations
    └── scripts/
        └── generate-prisma.js # Client generation script
```

## Database Schema

The platform uses PostgreSQL with Prisma ORM. Key models:

- **Document** - Core document records with OCR status, workflow tracking, and Azure integration
- **OcrResult** - Extracted key-value pairs and OCR output
- **Workflow** - User-defined graph workflow configurations
- **LabelingProject** - Labeling projects with custom field schemas
- **LabeledDocument** - Document labels and annotations
- **TrainingJob** - Azure Document Intelligence training jobs
- **TrainedModel** - Trained custom models
- **ReviewSession** - HITL review sessions with field corrections
- **ApiKey** - API key authentication records
- **FieldDefinition, DocumentLabel, FieldCorrection** - Supporting models

See `apps/shared/prisma/schema.prisma` for the complete schema.

## Development Guidelines

- **No backwards compatibility** - Update code directly without legacy support
- **Strong typing** - Avoid `any` types, use proper TypeScript typing
- **Test coverage** - Create/update tests for backend changes, run tests before committing
- **No placeholders** - Implement complete features, not stubs for future use
- **Documentation** - Update `/docs-md` folder when creating/modifying features
- **Generic design** - No document-specific implementations, support arbitrary workloads
- **Prisma generation** - Use `npm run db:generate` from `apps/backend-services` (writes to both backend and temporal)

## Deployment

See `/deployments/openshift/kustomize/` for Kubernetes/OpenShift deployment configurations.

## Documentation

- [API Documentation](../../docs-md/API.md)
- [HITL Architecture](../../docs-md/HITL_ARCHITECTURE.md)
- [Template Training](../../docs-md/TEMPLATE_TRAINING.md)
- [Graph Workflows](../../docs-md/graph-workflows/)
- [Adding Nodes & Activities](../../docs-md/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md)
- [DAG Workflow Engine](../../docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md)

## License

Apache License 2.0

