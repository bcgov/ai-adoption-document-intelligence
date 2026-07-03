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

A single bucket (MinIO) or container (Azure) holds most platform data. All keys are built and validated by the shared `@ai-di/blob-storage-paths` package (re-exported as `storage-path-builder.ts` in both apps) and follow the shape `{groupId}/{category}/{...}/{fileName}`, where `category` is one of `ocr`, `training`, `classification`, `benchmark`. Group-independent resources use the `_shared/{category}/...` prefix.

```
document-blobs/
├── {groupId}/ocr/{documentId}/
│   ├── original.{ext}                        # Uploaded file as provided (any supported ext.)
│   ├── normalized.pdf                        # Canonical PDF for OCR, workflows, in-app view
│   └── thumbnail.webp                        # List-view thumbnail
│
├── {groupId}/training/labeling-documents/{documentId}/
│   ├── original.{ext}                        # Labeling upload as provided
│   └── normalized.pdf                        # Canonical PDF for OCR and in-app view
│
├── {groupId}/classification/{classifierName}/{label}/
│   └── {filename}                             # Classifier training documents (staged here,
│                                              #   then mirrored to Azure for training)
├── _shared/classification/...                 # Shared "other" classifier training data
│
└── {groupId}/benchmark/datasets/{datasetId}/{datasetVersionId}/
    ├── dataset-manifest.json                  # Version manifest (schema, sample list)
    ├── inputs/
    │   └── {sampleId}.{ext}                   # Input documents (pdf, jpg, etc.)
    └── ground-truth/
        └── {sampleId}.json                    # Ground truth annotations
```

### Benchmark outputs container: `benchmark-outputs`

Created by the MinIO init script alongside `document-blobs`. Used for benchmark run artifacts.

### Training containers: `training-{templateModelId}-v{version}` (Azure only)

Dynamically created per training run by `TrainingService` via `AzureStorageService`. Azure Document Intelligence requires SAS URLs pointing to Azure containers, so these are always on Azure regardless of `BLOB_STORAGE_PROVIDER`.

```
training-{templateModelId}-v{version}/
├── fields.json                                # Field schema definition
├── {filename}                                 # Original document file
├── {filename}.ocr.json                        # OCR results
└── {filename}.labels.json                     # Label annotations
```

Container lifecycle: created fresh per training run, cleared before re-use, can be deleted after completion.

### Classifier training on Azure

There is no separate `classification` container. Classifier training documents live in the primary container under `{groupId}/classification/...`. When training runs, `ClassifierService.uploadDocumentsForTraining` mirrors those keys from the primary blob store to an Azure container with the **same name and same keys** (via `AzureStorageService`), and the classifier build request passes a container-root SAS URL with a per-label `prefix`. Layout OCR results (`{filename}.ocr.json`) are generated beside the images.

### Summary table

| Container / Bucket                     | Provider           | Created By                  | Lifecycle        |
|----------------------------------------|--------------------|-----------------------------|------------------|
| `document-blobs`                       | MinIO or Azure     | init-minio.sh / app startup | Permanent        |
| `benchmark-outputs`                    | MinIO or Azure     | init-minio.sh / app startup | Permanent        |
| `training-{templateModelId}-v{ver}`    | Azure only         | TrainingService             | Per training run |
| `document-blobs` (Azure mirror for classifier training) | Azure only | ClassifierService | Permanent        |

### Key patterns by feature

| Feature                  | Container            | Key Pattern                                                     | Operations       |
|--------------------------|----------------------|-----------------------------------------------------------------|------------------|
| Document upload          | `document-blobs`     | `{groupId}/ocr/{documentId}/original.{ext}`, `.../normalized.pdf`, `.../thumbnail.webp` | W, R, D prefix   |
| Labeling documents       | `document-blobs`     | `{groupId}/training/labeling-documents/{documentId}/original.{ext}`, `.../normalized.pdf` | W, R, D prefix   |
| Classifier staging       | `document-blobs`     | `{groupId}/classification/{classifierName}/{label}/{filename}`  | W, R, LIST, DEL prefix |
| Shared classifier data   | `document-blobs`     | `_shared/classification/...`                                    | R                |
| Benchmark datasets       | `document-blobs`     | `{groupId}/benchmark/datasets/{datasetId}/{versionId}/dataset-manifest.json` | W, R |
| Dataset inputs           | `document-blobs`     | `{groupId}/benchmark/datasets/{datasetId}/{versionId}/inputs/{sampleId}.{ext}` | W, R, D |
| Dataset ground truth     | `document-blobs`     | `{groupId}/benchmark/datasets/{datasetId}/{versionId}/ground-truth/{sampleId}.json` | W, R, D |
| HITL-derived datasets    | `document-blobs`     | same dataset patterns as above                                  | W, R             |
| Dataset cleanup          | `document-blobs`     | `{groupId}/benchmark/datasets/{datasetId}/` (deleteByPrefix)    | DEL prefix       |
| DI model training        | `training-{id}-v{n}` | `fields.json`, `{name}`, `{name}.ocr.json`, `{name}.labels.json` | W, R, DEL      |
| DI classifier training   | Azure `document-blobs` mirror | `{groupId}/classification/{classifierName}/{label}/{filename}` | W, R, DEL prefix |

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
| `blob-storage.module.ts`          | Dynamic NestJS module with provider factory; also provides the `BLOB_STORAGE_CONTAINER_NAME` token |
| `storage-path-builder.ts`         | Re-export of `@ai-di/blob-storage-paths` (key building/validation shared with the worker) |

### Temporal Workers (`apps/temporal/src/blob-storage/`)

| File                        | Purpose                                    |
|-----------------------------|--------------------------------------------|
| `blob-storage-client.ts`  | Standalone blob storage client (singleton)  |

## Local Development

MinIO is started via Docker Compose (root `docker-compose.yml`, `infra` profile). The `minio-init` sidecar runs `scripts/init-minio.sh` which creates the required buckets:

- `document-blobs` — primary storage for documents, labeling files, and datasets
- `benchmark-outputs` — benchmark run artifacts

```bash
# From repo root
docker compose --profile infra up -d
```

- **MinIO API**: http://localhost:19000
- **MinIO Console**: http://localhost:19001 (login: `minioadmin` / `minioadmin`)

Note: Training (`training-{projectId}`) and classification (`classification`) containers are Azure-only and not created in MinIO.
