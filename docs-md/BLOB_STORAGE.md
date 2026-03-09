# Blob Storage Architecture

## Overview

The platform uses a unified blob storage abstraction that supports two interchangeable providers: **MinIO** (S3-compatible, for local development) and **Azure Blob Storage** (for production/cloud deployments). The active provider is selected at runtime via the `BLOB_STORAGE_PROVIDER` environment variable.

Azure Document Intelligence model training always uses Azure Blob Storage regardless of the primary provider, since Azure DI requires SAS URLs pointing to Azure containers.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    NestJS Backend                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           BlobStorageInterface                    │   │
│  │   write · read · exists · delete · list ·         │   │
│  │   deleteByPrefix                                  │   │
│  └───────┬──────────────────────────┬───────────────┘   │
│          │                          │                    │
│  ┌───────▼──────────┐   ┌──────────▼─────────────┐     │
│  │ MinioBlobStorage  │   │ AzureBlobProvider       │     │
│  │ (@aws-sdk/s3)     │   │ (@azure/storage-blob)   │     │
│  └───────────────────┘   └────────────────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │       AzureStorageService                        │   │
│  │   Always Azure — containers & SAS tokens         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  Temporal Workers                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │       BlobStorageClient (singleton)               │   │
│  │   Same interface, non-NestJS factory pattern      │   │
│  │   Reads BLOB_STORAGE_PROVIDER to select backend   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Provider Selection

Set `BLOB_STORAGE_PROVIDER` in your environment:

| Value     | Provider               | Use Case                |
|-----------|------------------------|-------------------------|
| `minio`   | MinIO (S3-compatible)  | Local development       |
| `azure`   | Azure Blob Storage     | Production / cloud      |

Default: `minio`

## Container / Bucket Structure

### Primary container: `document-blobs`

A single bucket (MinIO) or container (Azure) holds most platform data, organized by key prefix:

```
document-blobs/
├── documents/{documentId}/
│   └── original.{ext}                        # Uploaded document (pdf, jpg, etc.)
│
├── labeling-documents/{documentId}/
│   └── original.{ext}                        # Documents uploaded via labeling workflow
│
├── classifier/{groupId}/{classifierName}/{label}/
│   └── {filename}                             # Classifier training documents (staged here
│                                              #   before being copied to Azure for training)
│
└── datasets/{datasetId}/{datasetVersionId}/
    ├── dataset-manifest.json                  # Version manifest (schema, sample list)
    ├── inputs/
    │   └── {sampleId}.{ext}                   # Input documents (pdf, jpg, etc.)
    └── ground-truth/
        └── {sampleId}.json                    # Ground truth annotations
```

### Benchmark outputs container: `benchmark-outputs`

Created by the MinIO init script alongside `document-blobs`. Used for benchmark run artifacts.

### Training containers: `training-{projectId}` (Azure only)

Dynamically created per training job via `AzureStorageService`. Azure Document Intelligence requires SAS URLs pointing to Azure containers, so these are always on Azure regardless of `BLOB_STORAGE_PROVIDER`.

```
training-{projectId}/
├── fields.json                                # Field schema definition
├── {filename}                                 # Original document file
├── {filename}.ocr.json                        # OCR results
└── {filename}.labels.json                     # Label annotations
```

Container lifecycle: created fresh per training run, cleared before re-use, can be deleted after completion.

### Classification container: `classification` (Azure only)

Hardcoded in `ClassifierService`. Used for Azure Document Intelligence classifier training — always Azure. Files are first uploaded to `document-blobs` under the `classifier/` prefix, then copied here (with the `classifier/` prefix stripped) when training is triggered.

```
classification/
└── {groupId}/{classifierName}/{label}/
    └── {filename}                             # Training document (copied from document-blobs)
```

### Summary table

| Container / Bucket          | Provider           | Created By                  | Lifecycle        |
|-----------------------------|--------------------|-----------------------------|------------------|
| `document-blobs`            | MinIO or Azure     | init-minio.sh / app startup | Permanent        |
| `benchmark-outputs`         | MinIO or Azure     | init-minio.sh / app startup | Permanent        |
| `training-{projectId}`      | Azure only         | TrainingService              | Per training job |
| `classification`            | Azure only         | ClassifierService            | Permanent        |

### Key patterns by feature

| Feature                  | Container            | Key Pattern                                                     | Operations       |
|--------------------------|----------------------|-----------------------------------------------------------------|------------------|
| Document upload          | `document-blobs`     | `documents/{documentId}/original.{ext}`                         | W, R, D          |
| Labeling documents       | `document-blobs`     | `labeling-documents/{documentId}/original.{ext}`                | W, R             |
| Classifier staging       | `document-blobs`     | `classifier/{groupId}/{classifierName}/{label}/{filename}`      | W, R, LIST, DEL prefix |
| Benchmark datasets       | `document-blobs`     | `datasets/{datasetId}/{versionId}/dataset-manifest.json`        | W, R             |
| Dataset inputs           | `document-blobs`     | `datasets/{datasetId}/{versionId}/inputs/{sampleId}.{ext}`      | W, R, D          |
| Dataset ground truth     | `document-blobs`     | `datasets/{datasetId}/{versionId}/ground-truth/{sampleId}.json` | W, R, D          |
| HITL-derived datasets    | `document-blobs`     | `datasets/{datasetId}/{versionId}/...` (same as above)          | W, R             |
| Dataset cleanup          | `document-blobs`     | `datasets/{datasetId}/` (deleteByPrefix)                        | DEL prefix       |
| DI model training        | `training-{projId}`  | `fields.json`, `{name}`, `{name}.ocr.json`, `{name}.labels.json` | W, R, DEL      |
| DI classifier training   | `classification`     | `{groupId}/{classifierName}/{label}/{filename}`                 | W, R, DEL prefix |

*Operations: W = write, R = read, D = delete, DEL prefix = deleteByPrefix, LIST = list*

## Environment Variables

### Primary Blob Storage

| Variable                          | Required When        | Description                                        | Default          |
|-----------------------------------|----------------------|----------------------------------------------------|------------------|
| `BLOB_STORAGE_PROVIDER`          | Always               | Storage backend: `minio` or `azure`                | `minio`          |

### MinIO Configuration (when `BLOB_STORAGE_PROVIDER=minio`)

| Variable                | Required | Description                         | Default          |
|-------------------------|----------|-------------------------------------|------------------|
| `MINIO_ENDPOINT`        | Yes      | MinIO server URL                    | —                |
| `MINIO_ACCESS_KEY`      | Yes      | MinIO access key                    | —                |
| `MINIO_SECRET_KEY`      | Yes      | MinIO secret key                    | —                |
| `MINIO_DOCUMENT_BUCKET` | No       | Bucket name for document storage    | `document-blobs` |

### Azure Blob Configuration (when `BLOB_STORAGE_PROVIDER=azure`)

| Variable                            | Required | Description                                           | Default          |
|-------------------------------------|----------|-------------------------------------------------------|------------------|
| `AZURE_STORAGE_CONNECTION_STRING`   | Yes      | Azure Storage account connection string               | —                |
| `AZURE_STORAGE_CONTAINER_NAME`      | No       | Container name for document storage                   | `document-blobs` |

### Azure Storage (always required for DI model training)

| Variable                            | Required | Description                                           |
|-------------------------------------|----------|-------------------------------------------------------|
| `AZURE_STORAGE_CONNECTION_STRING`   | Yes      | Azure Storage account connection string               |
| `AZURE_STORAGE_ACCOUNT_NAME`        | Yes      | Azure Storage account name (for SAS URL generation)   |
| `AZURE_STORAGE_ACCOUNT_KEY`         | Yes      | Azure Storage account key (for SAS URL generation)    |
| `AZURE_STORAGE_TRAINING_CONTAINER`  | Yes      | Container name for training data                      |

## NestJS Dependency Injection

### Primary Blob Storage

Inject the primary storage provider using the `BLOB_STORAGE` token:

```typescript
import { Inject } from '@nestjs/common';
import { BLOB_STORAGE, BlobStorageInterface } from '../blob-storage/blob-storage.interface';

export class MyService {
  constructor(
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
  ) {}

  async example() {
    await this.blobStorage.write('my-key', Buffer.from('data'));
    const data = await this.blobStorage.read('my-key');
    const exists = await this.blobStorage.exists('my-key');
    await this.blobStorage.delete('my-key');
    const keys = await this.blobStorage.list('prefix/');
    await this.blobStorage.deleteByPrefix('prefix/');
  }
}
```

### Azure Storage

For operations that must always use Azure (DI model training), inject `AzureStorageService` directly:

```typescript
import { AzureStorageService } from '../blob-storage/azure-storage.service';

export class MyTrainingService {
  constructor(
    private readonly azureStorage: AzureStorageService,
  ) {}

  async example() {
    await this.azureStorage.ensureContainerExists('my-container');
    await this.azureStorage.uploadFile('my-container', 'blob-name', buffer);
    const sasUrl = await this.azureStorage.generateSasUrl('my-container');
  }
}
```

### Module Import

Import `BlobStorageModule` in your feature module to access both providers:

```typescript
import { BlobStorageModule } from '../blob-storage/blob-storage.module';

@Module({
  imports: [BlobStorageModule],
  // ...
})
export class MyModule {}
```

## Temporal Worker Usage

Temporal workers run outside NestJS and use a standalone singleton factory:

```typescript
import { getBlobStorageClient } from '../blob-storage/blob-storage-client';

export async function myActivity(blobKey: string): Promise<Buffer> {
  const client = getBlobStorageClient();
  return client.read(blobKey);
}
```

The client reads the same `BLOB_STORAGE_PROVIDER` environment variable and supports the same MinIO/Azure configuration.

## File Locations

### Backend Services (`apps/backend-services/src/blob-storage/`)

| File                               | Purpose                                         |
|------------------------------------|-------------------------------------------------|
| `blob-storage.interface.ts`       | Interface definition and injection token         |
| `minio-blob-storage.service.ts`   | MinIO/S3 implementation                          |
| `azure-blob-provider.service.ts`  | Azure blob provider (`BlobStorageInterface`)                |
| `azure-storage.service.ts`| Azure training storage (always Azure)           |
| `blob-storage.module.ts`          | Dynamic NestJS module with provider factory      |

### Temporal Workers (`apps/temporal/src/blob-storage/`)

| File                        | Purpose                                    |
|-----------------------------|--------------------------------------------|
| `blob-storage-client.ts`  | Standalone blob storage client (singleton)  |

## Local Development

MinIO is started via Docker Compose (`apps/backend-services/docker-compose.yml`). The `minio-init` sidecar runs `scripts/init-minio.sh` which creates the required buckets:

- `document-blobs` — primary storage for documents, labeling files, and datasets
- `benchmark-outputs` — benchmark run artifacts

```bash
# From apps/backend-services/
docker compose up -d
```

- **MinIO API**: http://localhost:19000
- **MinIO Console**: http://localhost:19001 (login: `minioadmin` / `minioadmin`)

Note: Training (`training-{projectId}`) and classification (`classification`) containers are Azure-only and not created in MinIO.
