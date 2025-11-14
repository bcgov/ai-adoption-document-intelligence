# AI OCR Dashboard

Backend services for government document processing and OCR management.

## Project Structure

This is a monorepo containing:
- **Backend Services** (`apps/backend-services`) - NestJS API services for document processing

## Features

- 📄 Document Upload & Processing
- 🔍 **OCR (Optical Character Recognition)** - Real-time text extraction from images and PDFs
  - Image OCR processing with word-level bounding boxes
  - Multi-page PDF OCR with per-page analysis
  - Confidence scoring for extracted text


## Tech Stack

### Backend Services
- **NestJS** - Node.js framework
- **Fastify** - HTTP server
- **TypeScript** - Type Safety

## Getting Started

### Prerequisites

- Node.js 22+ (recommended)
- npm 9+

### Installation

1. Install root dependencies:
```bash
npm install
```

2. Install backend services dependencies:
```bash
cd apps/backend-services && npm install
```

### Development

#### Start Backend Services
```bash
npm run dev
# or
cd apps/backend-services && npm run start:dev
```

### Available Scripts

**Root Level:**
- `npm run dev` - Start backend services
- `npm run build` - Build backend services

**Backend Services:**
- `cd apps/backend-services && npm run start:dev` - Start development server
- `cd apps/backend-services && npm run build` - Build for production
- `cd apps/backend-services && npm run start:prod` - Start production server

## Project Structure

```
ai-ocr/
├── apps/
│   └── backend-services/      # NestJS backend services
│       ├── src/
│       │   ├── modules/        # Feature modules
│       │   ├── common/         # Shared utilities
│       │   └── main.ts         # Application entry point
│       └── package.json        # Backend services dependencies
└── package.json                # Root workspace configuration
```

## Development Notes

- Backend services handle document uploads via REST API
- Files are stored to local filesystem with UUID-based naming
- Database API and message queue integrations are stubbed and ready for implementation
- See `apps/backend-services/README.md` for detailed documentation

## License

MIT

