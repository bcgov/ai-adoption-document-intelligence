# Dataset Repository Setup Guide

This guide explains how to configure dataset repositories for the benchmarking system in development and test environments.

## Overview

The benchmarking system uses **dedicated Git repositories** for each dataset, with DVC (Data Version Control) managing large files via MinIO storage. To make this portable across different environments, we support:

1. **Tilde expansion** (`~`) for user home directories
2. **Temporary repositories** for e2e tests
3. **Environment variable defaults** for local development

## For Local Development

### Quick Setup

1. **Set the default repository path** in your `.env`:

```bash
# apps/backend-services/.env
DEFAULT_DATASET_REPOSITORY_PATH=~/Github/datasets-repo
```

2. **Create the repository** (already done for you):

```bash
# This was already created at:
~/Github/datasets-repo
```

### Creating a Dataset

When creating a dataset via the API or UI, you can use any of these formats for `repositoryUrl`:

```typescript
// Tilde expansion (recommended for local dev)
repositoryUrl: "~/Github/datasets-repo"

// file:// URL with tilde
repositoryUrl: "file://~/Github/datasets-repo"

// Absolute path
repositoryUrl: "file:///home/username/Github/datasets-repo"

// Relative path (from backend working directory)
repositoryUrl: "./datasets-repo"
```

**The backend will automatically expand `~` to your home directory.**

## For E2E Tests

### Using Test Utilities

We provide helper functions to create temporary dataset repositories for tests:

```typescript
import {
  createTempDatasetRepo,
  createMultipleTempDatasetRepos,
  cleanupTempRepos,
  type TempDatasetRepo,
} from "@/testUtils/datasetTestHelpers";

describe("Dataset E2E Tests", () => {
  let repo: TempDatasetRepo;

  beforeAll(async () => {
    // Create a temp repository
    repo = await createTempDatasetRepo("test-dataset-");
  });

  afterAll(async () => {
    // Clean up
    await repo.cleanup();
  });

  it("should create dataset", async () => {
    const response = await request.post("/api/benchmark/datasets", {
      data: {
        name: "Test Dataset",
        repositoryUrl: repo.url, // Uses file:///tmp/dataset-test-xyz
        dvcRemote: "minio",
      },
    });

    expect(response.status()).toBe(201);
  });
});
```

### Multiple Repositories

For tests requiring multiple datasets:

```typescript
const repos = await createMultipleTempDatasetRepos(3, "dataset-");

// Use repos[0].url, repos[1].url, repos[2].url

// Cleanup all at once
await cleanupTempRepos(repos);
```

### Example Test

See [tests/e2e/examples/benchmark-dataset-example.spec.ts.example](../../tests/e2e/examples/benchmark-dataset-example.spec.ts.example) for a complete example.

To use it:
```bash
# Rename the file
mv tests/e2e/examples/benchmark-dataset-example.spec.ts.example \
   tests/e2e/examples/benchmark-dataset-example.spec.ts

# Run it
npm run test:e2e
```

## Implementation Details

### Tilde Expansion

The `DvcService` automatically expands tilde paths:

```typescript
// Before (user input)
repositoryUrl: "~/Github/datasets-repo"

// After expansion (internal)
repositoryUrl: "/home/username/Github/datasets-repo"
```

This works for:
- Direct paths: `~/path/to/repo`
- file:// URLs: `file://~/path/to/repo`

### Temporary Repositories

The test utilities create fully initialized Git repositories:

```typescript
const repo = await createTempDatasetRepo();
// Creates:
// - /tmp/dataset-test-xyz/
// - Initialized git repo
// - Initial README commit
// - Returns file:///tmp/dataset-test-xyz
```

### Benefits

✅ **No hardcoded usernames** - Works on any developer's machine
✅ **Portable tests** - Temp repos are isolated and self-cleaning
✅ **Flexible configuration** - Use env vars, tilde paths, or absolute paths
✅ **Production-ready** - Same pattern works in containers and production

## Environment Variables

Add to your `apps/backend-services/.env`:

```bash
# Default location for dataset repositories (optional)
# Supports tilde (~) expansion
DEFAULT_DATASET_REPOSITORY_PATH=~/Github/datasets-repo

# Git credentials (optional, not needed for local file:// URLs)
DATASET_GIT_USERNAME=
DATASET_GIT_PASSWORD=

# MinIO configuration (required for DVC)
MINIO_ENDPOINT=http://localhost:19000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

## Troubleshooting

### "Repository not found" error

Make sure the repository exists:
```bash
ls -la ~/Github/datasets-repo
```

If not, create it:
```bash
mkdir -p ~/Github/datasets-repo
cd ~/Github/datasets-repo
git init
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### Tests failing with path errors

Ensure you're using the test utilities which handle cleanup automatically:

```typescript
// ❌ Don't hardcode paths
repositoryUrl: "/home/lex/datasets"

// ✅ Use test utilities
const repo = await createTempDatasetRepo();
repositoryUrl: repo.url
```

### MinIO connection errors

Make sure MinIO is running:
```bash
docker ps | grep minio
```

Should show `ai-doc-intelligence-minio` as healthy.

## See Also

- [Benchmarking System Requirements](../../feature-docs/003-benchmarking-system/REQUIREMENTS.md)
- [DVC Service Implementation](../../apps/backend-services/src/benchmark/dvc.service.ts)
- [Test Utilities](../../apps/backend-services/src/testUtils/datasetTestHelpers.ts)
