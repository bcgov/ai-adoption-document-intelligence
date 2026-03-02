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

## Bucket / Container Strategy

A single bucket (MinIO) or container (Azure) named `document-blobs` is used for all primary storage. Objects are organized via key prefixes:

| Prefix Pattern                              | Usage                                |
|---------------------------------------------|--------------------------------------|
| `documents/{documentId}/original`           | Uploaded document files              |
| `documents/{documentId}/ocr-result.json`    | OCR results                          |
| `labeling/{projectId}/{documentId}/...`     | Labeling OCR data                    |
| `classifier/{groupId}/{classifierName}/...` | Classifier training documents        |
| `benchmarking/...`                          | Benchmark artifacts                  |

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

### Azure Training Storage (always required for DI model training)

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

### Azure Training Storage

For operations that must always use Azure (DI model training), inject `AzureStorageService` directly:

```typescript
import { AzureStorageService } from '../blob-storage/azure-storage.service';

export class MyTrainingService {
  constructor(
    private readonly azureTrainingStorage: AzureStorageService,
  ) {}

  async example() {
    await this.azureTrainingStorage.ensureContainerExists('my-container');
    await this.azureTrainingStorage.uploadFile('my-container', 'blob-name', buffer);
    const sasUrl = await this.azureTrainingStorage.generateSasUrl('my-container');
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

MinIO is started automatically via Docker Compose (`apps/backend-services/docker-compose.yml`). The `init-minio.sh` script creates the required buckets:

- `benchmark-datasets` — for benchmarking DVC data
- `mlflow-artifacts` — for MLflow experiment artifacts
- `document-blobs` — for all document storage

Access the MinIO console at `http://localhost:9001` (default credentials in docker-compose).
