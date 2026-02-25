# Document Intelligence Platform - Frontend

Modern React single-page application for document processing, OCR management, workflow orchestration, document labeling, and human-in-the-loop review.

## Overview

The frontend provides a comprehensive UI for managing the entire document intelligence lifecycle:

- **Document Management** - Upload, view, and track document processing status
- **Processing Queue** - Real-time status monitoring with OCR progress tracking
- **Workflow Builder** - Visual graph editor for creating custom processing workflows
- **Labeling Workspace** - Canvas-based document annotation for training data creation
- **HITL Review** - Human-in-the-loop validation and correction interface
- **Settings** - API key generation and management

## Tech Stack

- **React 19** - Modern React with concurrent features
- **TypeScript** - Full type safety throughout the application
- **Vite** - Lightning-fast development with hot module replacement
- **Mantine UI** - Modern component library with dark mode support
- **React Flow (@xyflow/react)** - Visual workflow graph editor
- **React Konva** - Canvas-based document labeling and bounding box annotation
- **React PDF** - PDF rendering and viewing
- **TanStack Query** - Powerful data fetching and caching
- **Axios** - HTTP client with interceptors
- **CodeMirror** - JSON editor for workflow configuration

## Features

### 1. Document Upload & Management

**Components:**
- `DocumentUploadPanel` - Drag-and-drop file upload with base64 encoding
- `DocumentsList` - Document list with status badges
- `DocumentViewerModal` - Full-screen document viewer with OCR overlay

**Capabilities:**
- Upload multiple file formats (PDF, images)
- Attach custom metadata
- Select OCR model (prebuilt-layout, custom models)
- Specify custom workflow for processing
- Real-time upload progress tracking

### 2. Processing Queue

**Components:**
- `ProcessingQueue` - Real-time document status monitoring
- Status badges: pre_ocr, ongoing_ocr, completed_ocr, failed

**Capabilities:**
- View all documents with current processing status
- Click to view document details and OCR results
- Automatic status updates via polling
- Filter and search documents

### 3. Workflow Builder

**Pages:**
- `WorkflowListPage` - List all user workflows
- `WorkflowEditorPage` - Visual workflow graph editor

**Components:**
- `WorkflowEditor` - React Flow-based graph editor
- `NodeSelector` - Drag-and-drop node palette  (Future development)
- Node types: Start, OCR, HTTP Request, Azure Blob Read/Write, Conditional, Transform, Join, End

**Capabilities:**
- Create custom document processing workflows
- Visual node-based editing with drag-and-drop (Future development)
- Configure node parameters (OCR models, HTTP endpoints, conditions, transformations) 
- Workflow validation and execution via Temporal
- Save and version workflows
- Execute workflows on document upload

### 4. Labeling Workspace

**Pages:**
- `ProjectListPage` - Manage labeling projects
- `ProjectDetailPage` - Project overview with field schema and document list
- `LabelingWorkspacePage` - Canvas-based labeling interface

**Components:**
- Canvas-based bounding box drawing
- Field schema management (string, number, date, signature, selectionMark)
- Document navigator
- Label export for training

**Capabilities:**
- Create labeling projects with custom field definitions
- Upload documents to projects
- Draw bounding boxes for fields on images/PDFs
- Multi-page document support
- Label validation
- Export labeled data for Azure Document Intelligence training

### 5. HITL Review Queue

**Pages:**
- `ReviewQueuePage` - Queue dashboard with filters and statistics
- `ReviewWorkspacePage` - Field-by-field review and correction interface

**Capabilities:**
- Review OCR results with confidence scores
- Correct field values with action tracking (confirmed, corrected, flagged, deleted)
- Approve or escalate documents
- Queue filtering by status and document type
- Analytics and statistics (accuracy rates, review throughput)
- Session management

### 6. Settings

**Page:**
- `SettingsPage` - API key management

**Capabilities:**
- Generate API keys for programmatic access
- View API key prefix and creation date
- Revoke API keys
- Copy API key to clipboard

## Architecture

### Project Structure

```
src/
├── auth/                      # Authentication
│   ├── AuthContext.tsx        # React context for auth state, token refresh, and hooks
│   └── README.md              # Auth implementation documentation
│
├── components/                # Reusable UI components
│   ├── document/              # Document viewing
│   ├── queue/                 # Processing queue
│   ├── upload/                # Upload panel
│   ├── workflow/              # Workflow editor
│   └── [shared components]
│
├── data/                      # Data layer
│   ├── hooks/                 # React Query hooks
│   ├── services/              # API service classes
│   └── queryClient.ts         # TanStack Query client
│
├── features/                  # Feature modules
│   └── annotation/
│       ├── core/              # Shared annotation components
│       ├── labeling/          # Labeling workspace
│       │   ├── components/
│       │   └── pages/
│       └── hitl/              # HITL review
│           ├── components/
│           └── pages/
│
├── pages/                     # Top-level pages
│   ├── WorkflowListPage.tsx
│   ├── WorkflowEditorPage.tsx
│   └── SettingsPage.tsx
│
├── shared/                    # Shared utilities
│   ├── constants/             # App constants
│   ├── types/                 # TypeScript types
│   └── utils/                 # Helper functions
│
├── types/                     # Global type definitions
├── App.tsx                    # Main app shell
└── main.tsx                   # Application entry point
```

### State Management

- **Authentication**: React Context (`AuthContext`)
- **Server State**: TanStack Query for caching and synchronization
- **Local UI State**: React hooks (`useState`, `useReducer`)

### API Integration

All API calls go through a centralized `ApiService` class with:
- Cookie-based authentication (`withCredentials: true`)
- Automatic CSRF token header injection on state-changing requests
- 401 response interceptor with single-flight token refresh
- Error handling
- Type-safe response wrappers

## Getting Started

### Prerequisites

- **Node.js** 24+ and npm 10+
- Backend services running on `http://localhost:3002`
- Keycloak or other OIDC provider configured

### Installation

```bash
npm install
```

### Environment Configuration

Create a `.env` file in `apps/frontend/`:

```env
# API Configuration (empty for Vite proxy in development)
VITE_API_BASE_URL=

# Application Configuration
VITE_APP_NAME=Document Intelligence Platform
VITE_APP_VERSION=1.0.0
```

**Configuration Notes:**
- `VITE_API_BASE_URL` — Backend API URL; leave empty during development to use the Vite proxy
- All OIDC/OAuth configuration is on the backend; the frontend has no OIDC settings

### Development

```bash
# Start development server with hot reload
npm run dev
```

The application will be available at `http://localhost:3000`.

**Development Proxy:**
Vite proxies API requests to the backend:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3002`
- API requests to `/api/*` are proxied automatically

This eliminates CORS issues during development.

### Building

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

Production build outputs to `dist/`.

### Linting

```bash
# Run Biome linter
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

## Key Components

### Document Viewer

**Component:** `DocumentViewerModal`

Full-screen modal for viewing documents with OCR overlays:
- PDF rendering with `react-pdf`
- Image display
- OCR bounding box overlays
- Key-value pair display
- Confidence score visualization
- Multi-page navigation

### Workflow Editor

**Component:** `WorkflowEditor`

Visual graph editor built with React Flow:
- Drag-and-drop node creation (Future development)
- Visual edge connections
- Node configuration panel (Future development)
- Live validation
- Auto-layout with Dagre
- Zoom and pan controls

**Node Types:**
- **Start** - Entry point with document context
- **OCR** - Azure Document Intelligence processing
- **HTTP Request** - External API calls
- **Azure Blob Read/Write** - Storage operations
- **Conditional** - Branching logic with expression evaluation
- **Transform** - Data transformation with JSONata expressions
- **Join** - Merge multiple branches
- **End** - Workflow termination

### Labeling Canvas

**Component:** `LabelingWorkspacePage`

Canvas-based labeling interface using React Konva:
- Select boxes from initial OCR data
- Associate boxes with field definitions
- Multi-page document navigation
- Zoom and pan
- Label persistence

### Review Workspace

**Component:** `ReviewWorkspacePage`

Field-by-field review interface:
- Display OCR-extracted fields with confidence scores
- Edit field values
- Track correction actions (confirmed, corrected, flagged, deleted)
- Side-by-side document view with highlighting
- Session management
- Approve or escalate documents

## Authentication

The app uses a **backend-driven OAuth 2.0 Authorization Code flow** with cookie-based sessions:

1. User clicks "Login" → browser navigates to `/api/auth/login`
2. Backend generates PKCE challenge, stores verifier in HttpOnly cookie, redirects to Keycloak
3. User authenticates with Keycloak
4. Keycloak redirects back to backend callback with authorization code
5. Backend exchanges code for tokens, sets HttpOnly auth cookies, redirects to SPA
6. SPA calls `GET /api/auth/me` to load user profile (cookies sent automatically)
7. Proactive token refresh at 75% of token lifetime via `POST /api/auth/refresh`

The frontend **never handles raw tokens** — all tokens are stored in HttpOnly cookies by the backend. The only cookie readable by JavaScript is `csrf_token` (for the CSRF double-submit pattern).

**Auth Context:**
- `isAuthenticated` - Auth status
- `isLoading` - Loading state
- `user` - User profile (sub, name, email, roles, expires_at)
- `login()` - Initiate login flow
- `logout()` - Clear session and logout
- `refreshToken()` - Manually trigger token refresh

## Styling

- **Mantine UI** - Comprehensive component library
- **Dark mode** - Default color scheme
- **CSS Variables** - Mantine theme tokens
- **Responsive** - Mobile-friendly layouts
- **Custom CSS** - Component-specific styles in `.css` files

## Best Practices

### Component Guidelines

1. **Functional Components** - Use function components with hooks
2. **TypeScript** - Always use proper types, avoid `any`
3. **Props Interface** - Define explicit prop interfaces
4. **Error Boundaries** - Wrap unstable components
5. **Lazy Loading** - Code-split large feature modules

### Data Fetching

1. **Use TanStack Query** - For all server state
2. **Custom Hooks** - Wrap queries in reusable hooks
3. **Error Handling** - Handle loading, error, and success states
4. **Cache Invalidation** - Invalidate queries after mutations

### State Management

1. **Local State First** - Use `useState` for component-local state
2. **React Query** - For server state and caching
3. **Context Sparingly** - Only for cross-cutting concerns (auth)

## Development Tips

### Adding a New Page

1. Create page component in `src/pages/` or `src/features/*/pages/`
2. Add navigation item to `App.tsx` nav items
3. Add route handler in `App.tsx` main content area
4. Create API hooks in `src/data/hooks/`

### Adding a New Feature Module

1. Create feature directory in `src/features/`
2. Structure: `components/`, `pages/`, `types/`, `hooks/`
3. Export public API from `index.ts`
4. Integrate into main app navigation

### Working with React Flow

- Use `useNodesState` and `useEdgesState` for state management
- Implement `onNodesChange`, `onEdgesChange`, `onConnect` handlers
- Custom node types: define in separate files, register in `nodeTypes` prop
- Use `useReactFlow` hook for imperative API access

### Working with React Konva

- Use `Stage`, `Layer`, `Rect`, `Text` primitives
- Handle mouse events: `onMouseDown`, `onMouseMove`, `onMouseUp`
- Maintain separate state for drawing vs. committed shapes
- Use `transformer` for interactive shape manipulation

## Deployment

### Docker

```bash
# Build image
docker build -t frontend -f Dockerfile .

# Run container
docker run -p 3000:80 frontend
```

The Dockerfile uses nginx to serve the static build.

### Environment Variables for Production

Set environment variables at build time:

```bash
VITE_API_BASE_URL=https://api.example.com \
npm run build
```

Note: All OAuth/OIDC configuration is handled by the backend. The frontend has no OIDC settings.

## Troubleshooting

### CORS Issues

In development, ensure Vite proxy is configured in `vite.config.ts`.
In production, ensure backend CORS settings allow frontend origin.

### Authentication Issues

- Verify backend SSO environment variables (`SSO_AUTH_SERVER_URL`, `SSO_REALM`, etc.)
- Check Keycloak client configuration (allowed redirect URIs)
- Inspect browser console for authentication errors
- Verify backend CORS settings allow frontend origin

### Build Errors

- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check TypeScript errors: `npx tsc --noEmit`

### PDF Rendering Issues

Ensure PDF.js worker is correctly configured:
- Worker loads from CDN by default
- Verify `vite.config.ts` MIME type configuration
- Check browser console for worker errors

## License

Apache License 2.0
