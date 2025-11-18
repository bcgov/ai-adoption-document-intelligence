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
   npm run install

   ```

   This installs dependencies for the monorepo root and all workspace packages.

3. **Set up the database**

   ```bash
   # Start PostgreSQL database
   cd apps/backend-services
   podman-compose up -d

   # Copy and configure environment configuration
   cp .env.sample .env

   # Run database migrations
   npm run db:migrate -- --name init

   ```


4. **Start the development servers**

   Copy and configure environment configuration for the front end:

   ```bash
   cd apps/frontend

   # Copy and configure environment configuration
   cp .env.sample .env

   ```

   ```bash
   # To start react project, from root:
   npm run dev:frontend

   ```

   ```bash
   # From the project root
   npm run dev:backend

   ```

   The backend API will be available at `http://localhost:3002` and frontend on `http://localhost:3000`.

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


#### Environment Configuration

The backend services require several environment variables. Copy `.env.sample` to `.env` and adjust values as needed:

- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Application port (default: 3002)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend application URL for CORS
- `UPLOAD_DESTINATION` - Directory for file uploads