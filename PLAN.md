# Implementation Plan: Custom Template Models & API Key Authentication

## Overview

This plan covers two major features:
1. **Custom Template Model Support** - Allow users to select Azure Document Intelligence models before upload
2. **API Key Authentication** - Alternative authentication for the upload endpoint with single-key management

---

## Phase 1: Custom Template Model Support

### 1.1 Backend Changes

#### Environment Configuration
**File:** `apps/backend-services/.env.example`

- Add `AZURE_DOC_INTELLIGENCE_MODELS` environment variable
- Comma-separated list of allowed model IDs

```env
AZURE_DOC_INTELLIGENCE_MODELS=prebuilt-layout,prebuilt-document,prebuilt-invoice,prebuilt-receipt
```

#### Models Endpoint
**File:** `apps/backend-services/src/ocr/ocr.controller.ts` (new file)

- Add `GET /api/models` endpoint to return available models from env
- Returns array of model IDs for frontend dropdown

#### Database Schema Update
**File:** `apps/backend-services/prisma/schema.prisma`

- Add `model_id` field to Document model

```prisma
model Document {
  // ... existing fields
  model_id          String   @default("prebuilt-layout")
}
```

#### Update Upload DTO
**File:** `apps/backend-services/src/upload/dto/upload-document.dto.ts`

- Add required `model_id` field with validation against allowed models

#### Update Document Service
**File:** `apps/backend-services/src/document/document.service.ts`

- Accept and store `model_id` when creating documents

#### Update OCR Service
**File:** `apps/backend-services/src/ocr/ocr.service.ts`

- Remove hardcoded `azureModelId = "prebuilt-layout"`
- Fetch `model_id` from document record
- Use document's model_id in Azure API URL

### 1.2 Frontend Changes

#### Fetch Available Models
**File:** `apps/frontend/src/data/hooks/useModels.ts` (new file)

- `useModels()` hook to fetch available models from `/api/models`

#### Update Upload Panel
**File:** `apps/frontend/src/components/upload/DocumentUploadPanel.tsx`

- Add model selector dropdown (fetched from backend)
- User selects model BEFORE dropping files
- Selected model applies to entire batch
- Pass selected `model_id` with each upload request

#### Update Results View
**File:** `apps/frontend/src/components/viewer/DocumentViewerModal.tsx`

- Display `model_id` used for processing in document details

#### Update Document Type
**File:** `apps/frontend/src/types/document.ts` (or similar)

- Add `model_id` field to Document type

### 1.3 Unit Tests

**Backend Tests:**
- `apps/backend-services/src/ocr/ocr.service.spec.ts` - Test model_id is used correctly
- `apps/backend-services/src/ocr/ocr.controller.spec.ts` - Test models endpoint
- `apps/backend-services/src/upload/upload.controller.spec.ts` - Test model_id validation

**Frontend Tests:**
- `apps/frontend/src/components/upload/DocumentUploadPanel.test.tsx` - Test model selector
- `apps/frontend/src/data/hooks/useModels.test.ts` - Test models hook

---

## Phase 2: API Key Authentication

### 2.1 Database Schema

**File:** `apps/backend-services/prisma/schema.prisma`

Add new ApiKey model (one key per user):

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  key_hash    String    @unique              // Hashed API key
  key_prefix  String                         // First 8 chars for display
  user_id     String    @unique              // One key per user
  user_email  String
  created_at  DateTime  @default(now())
  last_used   DateTime?
}
```

### 2.2 Backend Implementation

#### Create API Key Module
**New files in:** `apps/backend-services/src/api-key/`

- `api-key.module.ts` - Module definition
- `api-key.service.ts` - Key generation, hashing, validation
- `api-key.controller.ts` - Endpoints for key management

#### API Key Service
- Generate secure random key (32 bytes, base64 encoded)
- Hash key with bcrypt before storage
- Validate keys by comparing hashes
- Enforce one key per user

#### API Key Controller Endpoints
- `GET /api/api-key` - Get user's key info (prefix only, or null if none)
- `POST /api/api-key` - Generate key (returns full key ONCE, fails if key exists)
- `DELETE /api/api-key` - Delete user's key
- `POST /api/api-key/regenerate` - Delete existing and create new key

#### Create API Key Auth Decorator & Guard
**New files:**
- `apps/backend-services/src/auth/api-key-auth.guard.ts` - Guard implementation
- `apps/backend-services/src/auth/api-key-auth.decorator.ts` - `@ApiKeyAuth()` decorator

The decorator marks endpoints that accept API key authentication. When applied:
- Check for `X-API-Key` header
- Validate against stored hashed keys
- Create request context with user info from key record
- Skip normal BCGovAuthGuard for this request

#### Apply Decorator to Upload Endpoint
**File:** `apps/backend-services/src/upload/upload.controller.ts`

- Add `@ApiKeyAuth()` decorator to upload endpoint
- Endpoint now accepts either Bearer token OR API key

### 2.3 Frontend Implementation

#### Create Settings Page
**New files:**
- `apps/frontend/src/pages/SettingsPage.tsx` - Settings page with API key management

#### Settings Page Features
- Show current API key status (has key or not)
- Display key prefix if key exists
- "Generate Key" button (if no key exists)
- "Regenerate Key" button (if key exists)
- "Delete Key" button (if key exists)
- Modal showing full key ONCE after generation with copy button
- Display API endpoint URL and example curl command

#### Update Router
**File:** `apps/frontend/src/App.tsx` (or router config)

- Add `/settings` route
- Add Settings link in navigation

#### Create API Key Hook
**New file:** `apps/frontend/src/data/hooks/useApiKey.ts`

- `useApiKey()` - Fetch user's key info
- `useGenerateApiKey()` - Mutation for creating key
- `useRegenerateApiKey()` - Mutation for regenerating key
- `useDeleteApiKey()` - Mutation for deleting key

### 2.4 Unit Tests

**Backend Tests:**
- `apps/backend-services/src/api-key/api-key.service.spec.ts` - Test key generation, hashing, validation
- `apps/backend-services/src/api-key/api-key.controller.spec.ts` - Test all endpoints
- `apps/backend-services/src/auth/api-key-auth.guard.spec.ts` - Test guard logic
- `apps/backend-services/src/upload/upload.controller.spec.ts` - Test upload with API key

**Frontend Tests:**
- `apps/frontend/src/pages/SettingsPage.test.tsx` - Test settings page UI
- `apps/frontend/src/data/hooks/useApiKey.test.ts` - Test API key hooks

---

## Documentation

### Update README
**File:** `README.md`

Add sections for:
- Custom model selection feature
- API key authentication usage
- Example API calls with API key

### API Documentation
**File:** `docs/API.md` (new file)

- Document upload endpoint with model_id parameter
- Document API key authentication header format
- Example curl commands for API key usage

---

## Implementation Order

1. **Phase 1: Custom Template Models**
   - Backend: Env config, schema migration, models endpoint, OCR service update
   - Frontend: Models hook, upload panel model selector, results display
   - Tests: Backend and frontend unit tests
   - Documentation: Update README

2. **Phase 2: API Key Authentication**
   - Backend: Schema migration, API key module, guard & decorator
   - Frontend: Settings page, API key hooks
   - Tests: Backend and frontend unit tests
   - Documentation: API docs with examples

---

## Security Considerations

### API Key Security
- Never store plaintext keys - use bcrypt hashing
- Show full key only ONCE at creation
- Store key prefix (first 8 chars) for identification

### Input Validation
- Validate model_id against allowed list from environment
- Sanitize all user inputs

---

## Files to Create/Modify Summary

### New Files
- `apps/backend-services/src/ocr/ocr.controller.ts`
- `apps/backend-services/src/api-key/api-key.module.ts`
- `apps/backend-services/src/api-key/api-key.service.ts`
- `apps/backend-services/src/api-key/api-key.controller.ts`
- `apps/backend-services/src/auth/api-key-auth.guard.ts`
- `apps/backend-services/src/auth/api-key-auth.decorator.ts`
- `apps/frontend/src/data/hooks/useModels.ts`
- `apps/frontend/src/data/hooks/useApiKey.ts`
- `apps/frontend/src/pages/SettingsPage.tsx`
- `docs/API.md`
- Test files for all new modules

### Modified Files
- `apps/backend-services/.env.example`
- `apps/backend-services/prisma/schema.prisma`
- `apps/backend-services/src/ocr/ocr.service.ts`
- `apps/backend-services/src/ocr/ocr.module.ts`
- `apps/backend-services/src/upload/upload.controller.ts`
- `apps/backend-services/src/upload/dto/upload-document.dto.ts`
- `apps/backend-services/src/document/document.service.ts`
- `apps/backend-services/src/auth/auth.module.ts`
- `apps/frontend/src/components/upload/DocumentUploadPanel.tsx`
- `apps/frontend/src/components/viewer/DocumentViewerModal.tsx`
- `apps/frontend/src/App.tsx` (router)
- `README.md`
