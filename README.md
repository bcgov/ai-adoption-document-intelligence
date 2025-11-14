# AI Adoption - Document Intelligence

A government-scale document intelligence platform designed to transform unstructured documents into structured, business-ready data across BC Government ministries.

## Vision

This platform will provide a secure, customizable, and scalable solution for automated document intake, OCR processing, data extraction, and system integration. It will support diverse workflows and enable teams, projects, and ministries to configure tailored document processing pipelines while maintaining compliance with public sector standards.

## Capabilities

The platform will deliver:

**Document Intake**
- Multi-channel document ingestion (email, web uploads, mobile capture, scanning devices, API endpoints)
- Support for printed, typed, and handwritten content
- Multiple file formats (PDF, images, Office documents)
- Batch and real-time processing

**Intelligent Processing**
- OCR extraction with layout analysis
- Template-based and neural model approaches
- Multi-language support and confidence scoring
- Document classification and routing
- Key-value pair extraction

**Customization**
- Per-ministry/team/project workspaces
- Custom field mapping and extraction rules
- Configurable workflows and routing logic
- Model training and fine-tuning capabilities
- Human-in-the-loop validation interfaces

**Integration & Operations**
- RESTful APIs for system integration
- Metadata extraction and full-text search
- Compliance with records management standards
- Role-based access controls and audit trails
- Monitoring and analytics dashboards

## Use Cases

Initial focus areas include:
- Social services application processing (SDPR)
- Invoice automation (CITZ)
- Freedom of Information requests
- General form processing across ministries

## Technical Approach

The platform will leverage both managed cloud services and open-source solutions to balance rapid deployment with customization needs. Architecture decisions will prioritize security, scalability, cost-effectiveness, and reusability across government.

## Compliance

All implementations will adhere to:
- FOIPPA privacy requirements
- BC Government security standards
- Canadian data residency requirements
- WCAG 2.1 AA accessibility standards

## Local Development Setup

This guide will help you set up the development environment and get started with contributing to the AI Document Intelligence platform. The backend services use PostgreSQL as the database with Prisma ORM for local development.

### Prerequisites

Before you begin, ensure you have the following installed:

- **[Node.js](https://nodejs.org/) 22.x or later**
- **[npm](https://www.npmjs.com/) 9.x or later**
- **[Podman](https://podman.io/) or Docker** (for containerized PostgreSQL)
- **[Git](https://git-scm.com/)** for version control

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-adoption-document-intelligence
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```
   This installs dependencies for the monorepo root and all workspace packages.

3. **Set up the database**
   ```bash
   # Start PostgreSQL database
   cd apps/backend-services
   podman-compose up -d

   # Copy environment configuration
   cp .env.sample .env

   # Run database migrations
   npm run db:migrate -- --name init

   # Generate Prisma client
   npm run db:generate
   ```

   This will start a PostgreSQL 15 container with:
   - Database: `ai_doc_intelligence`
   - User: `postgres`
   - Password: `postgres`
   - Port: `5432`

   The `.env` file contains:
   - Database connection string
   - Application port configuration
   - CORS settings
   - Storage paths

   This creates the initial database schema with tables.

4. **Start the development server**
   ```bash
   # From the project root
   npm run dev

   # Or start backend services directly
   npm run dev:backend-services
   ```

   The backend API will be available at `http://localhost:3002`.

### Database Management

- **View Database**: Use any PostgreSQL client to connect to `localhost:5432`
- **Reset Database**: Stop containers and remove volumes, then restart
  ```bash
  cd apps/backend-services
  podman-compose down -v
  podman-compose up -d
  npm run db:reset
  ```
- **View Migration Status**: `npm run db:status`
- **Create New Migration**: `npm run db:migrate -- --name your_migration_name`
- **Open Prisma Studio** (database GUI): `npm run db:studio`

### Database Schema

See `apps/backend-services/prisma/schema.prisma` for the complete schema definition.

### Development Workflow

#### Available Scripts

From the project root:

- `npm run dev` - Start backend services in development mode
- `npm run build` - Build backend services for production
- `npm run lint` - Run ESLint across the entire monorepo
- `npm run lint:fix` - Auto-fix linting issues

From `apps/backend-services/`:

- `npm run start:dev` - Start NestJS in watch mode
- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage report
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run db:reset` - Reset database and re-run all migrations
- `npm run db:status` - Check migration status
- `npm run db:seed` - Run database seed scripts

#### Project Structure

```
ai-adoption-document-intelligence/
├── apps/
│   ├── backend-services/          # NestJS API server
│   │   ├── prisma/                # Database schema and migrations
│   │   ├── src/
│   │   │   ├── upload/            # File upload handling
│   │   │   ├── document/          # Document processing services
│   │   │   ├── database/          # Database services
│   │   │   └── main.ts            # Application entry point
│   │   ├── docker-compose.yml     # Database container config
│   │   └── package.json
│   └── frontend/                  # Frontend application (future)
├── packages/
│   └── eslint-config-custom/      # Shared ESLint configuration
├── docs/                          # Documentation (planned)
└── README.md
```

#### Code Quality

The project uses several tools to maintain code quality:

- **ESLint** - Code linting with custom configuration
- **Prettier** - Code formatting
- **Jest** - Unit testing framework
- **TypeScript** - Type checking
- **Husky** - Git hooks for pre-commit quality checks

Run `npm run lint` to check code quality across the entire monorepo.

#### Testing

```bash
cd apps/backend-services
npm run test                    # Run all tests
npm run test:watch             # Run tests in watch mode
npm run test:cov               # Generate coverage report
```

#### Environment Configuration

The backend services require several environment variables. Copy `.env.sample` to `.env` and adjust values as needed:

- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Application port (default: 3002)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend application URL for CORS
- `UPLOAD_DESTINATION` - Directory for file uploads

## High-Level Architecture
ai-adoption-document-intelligence/

├── domains/
│   ├── document-intake/          # Multi-channel ingestion
│   ├── ocr-processing/            # OCR engines & layout analysis
│   ├── data-extraction/           # Field extraction & validation
│   ├── classification/            # Document type classification
│   └── workflow-orchestration/    # Routing & integration logic

├── services/
│   ├── api/                       # Public REST API
│   ├── web-ui/                    # Admin dashboard & validation interface
│   ├── training-studio/           # Model training interface
│   └── citizen-portal/            # Public document submission

├── models/
│   ├── pretrained/                # Base OCR & layout models
│   ├── custom-templates/          # Ministry-specific templates
│   ├── custom-neural/             # Fine-tuned neural models
│   └── evaluation/                # Model performance benchmarks

├── infrastructure/
│   ├── cloud/                     # Cloud service configurations
│   ├── kubernetes/                # Container orchestration
│   ├── mlops/                     # Training & deployment pipelines
│   └── monitoring/                # Observability & logging

├── integrations/
│   ├── adapters/                  # System-specific connectors
│   ├── crm/                       # CRM integrations
│   ├── records-management/        # Archives & retention systems
│   └── notification/              # Email & alerting

├── shared/
│   ├── authentication/            # SSO & identity management
│   ├── security/                  # Encryption & compliance
│   ├── storage/                   # Document & metadata storage
│   └── common/                    # Shared utilities

├── docs/
│   ├── architecture/              # System design & ADRs
│   ├── api/                       # API specifications
│   ├── deployment/                # Operational guides
│   └── training/                  # Model training guides

└── tests/
    ├── benchmarks/                # Performance & accuracy tests
    ├── integration/               # System integration tests
    └── compliance/                # Security & privacy validation
