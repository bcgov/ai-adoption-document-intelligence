# API Documentation

This document describes the API endpoints available in the Document Intelligence platform.

## Authentication

The API supports two authentication methods:

### 1. Bearer Token (OAuth)
Use the standard OAuth flow through the frontend application. The bearer token is included automatically in requests from the frontend.

```
Authorization: Bearer <your-oauth-token>
```

### 2. API Key (for programmatic access)
Generate an API key from the Settings page in the frontend, then include it in requests:

```
X-API-Key: <your-api-key>
```

**Note:** API key authentication is only available for the upload endpoint.

---

## Endpoints

### Get Available Models

Returns the list of Azure Document Intelligence models available for document processing.

**Endpoint:** `GET /api/models`

**Authentication:** Bearer token required

**Response:**
```json
{
  "models": ["prebuilt-layout", "prebuilt-document", "prebuilt-invoice", "prebuilt-receipt"]
}
```

---

### Upload Document

Upload a document for OCR processing.

**Endpoint:** `POST /api/upload`

**Authentication:** Bearer token OR API key

**Request Body:**
```json
{
  "title": "Invoice 2024-001",
  "file": "<base64-encoded-file-data>",
  "file_type": "pdf",
  "original_filename": "invoice-2024-001.pdf",
  "model_id": "prebuilt-invoice",
  "metadata": {
    "department": "Finance",
    "priority": "high"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Document title |
| file | string | Yes | Base64-encoded file content |
| file_type | string | Yes | File type: `pdf`, `image`, or `scan` |
| original_filename | string | No | Original filename |
| model_id | string | Yes | Azure Document Intelligence model ID |
| metadata | object | No | Additional metadata |

**Response:**
```json
{
  "success": true,
  "document": {
    "id": "clx1234567890",
    "title": "Invoice 2024-001",
    "original_filename": "invoice-2024-001.pdf",
    "file_type": "pdf",
    "file_size": 102400,
    "status": "ongoing_ocr",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example with curl:**
```bash
# Using API key
curl -X POST http://localhost:3002/api/upload \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "title": "My Document",
    "file": "JVBERi0xLjQKJeLjz...",
    "file_type": "pdf",
    "model_id": "prebuilt-layout"
  }'
```

---

### API Key Management

#### Get Current API Key Info

**Endpoint:** `GET /api/api-key`

**Authentication:** Bearer token required

**Response (when key exists):**
```json
{
  "apiKey": {
    "id": "clx1234567890",
    "keyPrefix": "abc12345",
    "userEmail": "user@example.com",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "lastUsed": "2024-01-16T14:22:00.000Z"
  }
}
```

**Response (when no key exists):**
```json
{
  "apiKey": null
}
```

---

#### Generate New API Key

**Endpoint:** `POST /api/api-key`

**Authentication:** Bearer token required

**Response:**
```json
{
  "apiKey": {
    "id": "clx1234567890",
    "key": "abc12345xyz67890...",
    "keyPrefix": "abc12345",
    "userEmail": "user@example.com",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "lastUsed": null
  }
}
```

**Important:** The full `key` value is only returned once during generation. Store it securely immediately.

**Error (409 Conflict):** Returned if user already has an API key.

---

#### Delete API Key

**Endpoint:** `DELETE /api/api-key`

**Authentication:** Bearer token required

**Response:** `204 No Content`

---

#### Regenerate API Key

Deletes the existing key and creates a new one.

**Endpoint:** `POST /api/api-key/regenerate`

**Authentication:** Bearer token required

**Response:**
```json
{
  "apiKey": {
    "id": "clx9876543210",
    "key": "xyz98765abc12345...",
    "keyPrefix": "xyz98765",
    "userEmail": "user@example.com",
    "createdAt": "2024-01-16T09:00:00.000Z",
    "lastUsed": null
  }
}
```

---

## Document Status Values

| Status | Description |
|--------|-------------|
| `pre_ocr` | Document uploaded but not yet sent for processing |
| `ongoing_ocr` | Document is being processed by Azure |
| `completed_ocr` | OCR processing completed successfully |
| `failed` | OCR processing failed |

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "No Bearer token provided",
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Invalid token",
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Resource not found",
  "error": "Not Found"
}
```

### 409 Conflict
```json
{
  "statusCode": 409,
  "message": "User already has an API key. Delete it first or use regenerate.",
  "error": "Conflict"
}
```
