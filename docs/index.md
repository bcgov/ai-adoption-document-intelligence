---
layout: home
title: "Documentation Hub"
hero:
  name: "Document Intelligence Platform"
  tagline: "Enterprise-grade document processing platform with OCR, graph-based workflow orchestration, document classification, custom model training, and human-in-the-loop review capabilities."
  actions:
    - theme: brand
      text: "View API Docs →"
      link: /api-reference
    - theme: alt
      text: "View on GitHub ↗"
      link: https://github.com/bcgov/ai-adoption-document-intelligence
features:
  - icon: 📄
    title: "Document Management"
    details: "Full lifecycle document management with metadata tagging, versioning, and relationship tracking. Supports PDF, images, and multi-page documents."
  - icon: 🏷️
    title: "Labeling & Annotation"
    details: "Project-based labeling system for ground truth creation. Supports bounding box annotations, field labeling, and batch operations for training data preparation."
  - icon: 🧠
    title: "Model Training"
    details: "End-to-end custom model training pipeline. Train Azure Document Intelligence custom models from labeled data with versioning and deployment management."
  - icon: 👥
    title: "Human Review Queue"
    details: "Collaborative HITL system with assignment management, bulk operations, and confidence-based routing for quality assurance workflows."
  - icon: 🔐
    title: "Authentication & Security"
    details: "Keycloak SSO integration with JWT bearer tokens and API key management. Role-based access control for secure multi-tenant operations."
  - icon: 📊
    title: "Extensible Activities"
    details: "Developer-friendly activity registry system. Create custom activities by extending base classes and registering them in the workflow engine."
  - icon: 🗂️
    title: "Document Classification"
    details: "Train Azure Document Intelligence classifiers to automatically identify document types. Manage the full lifecycle from training data upload through classifier deployment."
---

## Platform Overview

The Document Intelligence Platform is a comprehensive solution for document processing workflows. It combines OCR services, flexible graph-based workflow orchestration, supervised learning capabilities, and collaborative review tools into a unified platform.

### 🚀 Core Features

- **Document Processing** - Multi-format document upload and OCR with Azure Document Intelligence
- **Document Classification** - Train and deploy Azure Document Intelligence classifiers for automated document type routing
- **Graph Workflows** - DAG-based workflow engine with 30+ extensible activities powered by Temporal
- **Model Training** - Supervised learning with custom model training and versioned deployments
- **HITL Review** - Collaborative human-in-the-loop workflows with confidence-based routing

### 🏗️ Architecture

- **Backend** - NestJS with Express, Prisma ORM, PostgreSQL
- **Frontend** - React with TypeScript, Mantine UI
- **Orchestration** - Temporal workflow engine with durable execution
- **Storage** - Unified blob storage (MinIO for local dev, Azure Blob for cloud)

## Key Capabilities

### Graph-Based Workflow Engine

The platform features a DAG workflow engine for multi-step document processing. Workflows are defined as JSON graphs; the UI provides a JSON editor and a read-only React Flow visualization synced to that JSON.

**30+ Built-in Activities:** OCR processing, field extraction, validation, confidence filtering, model training, HITL routing, parallel execution, conditional branching, and more.

## Quick Start

::: info Full setup
This page is a public overview. For prerequisites, environment files, and complete local setup, use the root [README.md](https://github.com/bcgov/ai-adoption-document-intelligence/blob/main/README.md) in the repository.
:::

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Start Infrastructure

```
# From repo root
docker compose --profile infra up -d
docker compose --profile temporal up -d
```

### 3. Initialize Database

```bash
cd apps/backend-services
# Create .env (no sample committed) with at least:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_doc_intelligence?schema=public
npm run db:migrate
npm run db:generate
```

### 4. Start Services

```
# From repo root (backend + frontend + temporal worker)
npm run dev

# Or individually:
# npm run dev:backend
# npm run dev:frontend
# cd apps/temporal && npm run dev
```

### 5. Access the Platform

- **Frontend:** `http://localhost:3000`
- **Backend API:** `http://localhost:3002`
- **API Docs:** `http://localhost:3002/api`
- **Temporal UI:** `http://localhost:8088`

## API Documentation

Comprehensive REST API documentation is available on the [API Reference](./api-reference.md) page. The API supports both Bearer token authentication (Keycloak SSO) and API key authentication.

- [API Reference](./api-reference.md): interactive API documentation with request and response schemas, authentication details, and example requests from the OpenAPI spec.
- [GitHub repository](https://github.com/bcgov/ai-adoption-document-intelligence): source code, issues, contributions and further documentation.

## Technology Stack

### Core Technologies

#### Backend Services

- NestJS 11 + Express
- Prisma ORM
- PostgreSQL 14+
- Temporal Workflow Engine
- Azure Document Intelligence SDK

#### Frontend Application

- React 19 + TypeScript
- Vite
- Mantine UI Components
- React Flow (workflow visualization)
- Axios + React Query

## Project Structure

```
apps/
├── backend-services/    # NestJS REST API
├── frontend/            # React application
├── temporal/            # Temporal workflow workers
├── ches-adapter/        # CHES email notification adapter
└── shared/              # Shared Prisma schema

packages/                # Shared workspace packages (@ai-di/*)
docs-md/                 # Technical documentation (by topic)
docs/                    # This documentation site
deployments/             # OpenShift/Kubernetes manifests
tools/                   # Load testing and dev tooling
```

## Learn More

::: info Additional Documentation
Detailed technical documentation is available in the `/docs-md` directory, organized by topic. Start with the [repo wiki](./wiki/) for a routing map, then:

- **docs-md/architecture/:** System design — HITL architecture, blob storage, template models, database services
- **docs-md/workflows/:** Workflow engine architecture and activity development guides
- **docs-md/operations/ & monitoring/:** Deployment, environment configuration, and the PLG observability stack
:::
