# Confusion Profiles

Confusion profiles store character-level confusion matrices with provenance metadata, allowing reuse and comparison across benchmark runs and OCR improvement workflows.

## Data Model

Each `ConfusionProfile` record contains:

| Field       | Type     | Description |
|-------------|----------|-------------|
| id          | String   | CUID primary key |
| name        | String   | Human-readable profile name |
| description | String?  | Optional description |
| matrix      | Json     | `{ trueChar: { recognizedChar: count } }` |
| metadata    | Json?    | Derivation provenance, examples, field counts |
| group_id    | String   | Owning group |
| created_at  | DateTime | Creation timestamp |
| updated_at  | DateTime | Last update timestamp |

## REST API

All endpoints are scoped to a group: `api/groups/:groupId/confusion-profiles`

### Derive and save a profile

```
POST /api/groups/:groupId/confusion-profiles/derive
```

Body:
```json
{
  "name": "Q4 OCR Profile",
  "description": "Derived from Q4 corrections",
  "sources": {
    "templateModelIds": ["tm-1"],
    "benchmarkRunIds": ["run-1", "run-2"],
    "fieldKeys": ["date", "amount"],
    "startDate": "2025-10-01",
    "endDate": "2025-12-31"
  }
}
```

When `sources` is omitted, all HITL corrections in the group are used. When `benchmarkRunIds` is provided, mismatch pairs from those runs' `perSampleResults[].evaluationDetails` are also included.

When `templateModelIds` is provided, the service resolves those template models' `field_schema` entries to field keys, then uses those field keys to filter both HITL corrections and benchmark mismatch pairs. If both `templateModelIds` and `fieldKeys` are provided, only the intersection of both sets is used.

The derived profile metadata includes:
- `derivedAt` — ISO timestamp of derivation
- `sources` — the filter criteria used
- `pairCount` — total correction pairs processed
- `examples` — up to 5 source examples per character pair (`{ trueChar: { recognizedChar: [{ fieldKey, predicted, expected }] } }`)
- `fieldCounts` — distinct field count per character pair

### Create with explicit matrix

```
POST /api/groups/:groupId/confusion-profiles
```

### List profiles

```
GET /api/groups/:groupId/confusion-profiles
```

### Get by ID

```
GET /api/groups/:groupId/confusion-profiles/:id
```

### Update

```
PATCH /api/groups/:groupId/confusion-profiles/:id
```

### Delete

```
DELETE /api/groups/:groupId/confusion-profiles/:id
```

## Frontend UI

The confusion profiles UI is accessible from the Group Detail Page via a "Confusion Profiles" tab.

### Components

| Component | Path | Description |
|-----------|------|-------------|
| ConfusionProfilesPanel | `apps/frontend/src/features/benchmarking/components/ConfusionProfilesPanel.tsx` | Lists profiles in a table (name, total confusions, created date, actions). Provides a "Derive new profile" button that opens a modal to create a profile from HITL correction data. |
| ConfusionMatrixEditor | `apps/frontend/src/features/benchmarking/components/ConfusionMatrixEditor.tsx` | Modal editor for the confusion matrix. Shows a sortable table of true char / OCR read as / count / fields / examples. Supports deleting entries, adding new entries, and saving the curated matrix back via PATCH. Rows with count=1 or fields=1 are rendered at lower opacity to flag likely noise. |

### React Query Hooks

File: `apps/frontend/src/features/benchmarking/hooks/useConfusionProfiles.ts`

| Hook | Description |
|------|-------------|
| `useConfusionProfiles(groupId)` | Fetches list of profiles for a group |
| `useConfusionProfile(groupId, profileId)` | Fetches a single profile with matrix |
| `useDeriveProfile(groupId)` | Mutation to derive a new profile from corrections |
| `useUpdateProfile(groupId)` | Mutation to PATCH a profile (name, matrix, metadata, etc.) |
| `useDeleteProfile(groupId)` | Mutation to delete a profile |

All mutations invalidate the `["confusion-profiles", groupId]` query key on success.

### Benchmark Run Detail Page

The benchmark run detail page (`apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx`) includes a "Create Confusion Profile" button for completed runs. This opens a modal with Name and Description fields, and derives a confusion profile from the current run's mismatch pairs using `sources: { benchmarkRunIds: [runId] }`. The group ID is resolved from the project associated with the run.

## Module Structure

```
apps/backend-services/src/confusion-profile/
  confusion-profile.module.ts      — NestJS module (imports BenchmarkModule, DatabaseModule)
  confusion-profile.service.ts     — CRUD + derivation logic
  confusion-profile.controller.ts  — REST endpoints
  dto/
    create-confusion-profile.dto.ts
    update-confusion-profile.dto.ts
    derive-confusion-profile.dto.ts
    confusion-profile-response.dto.ts
    index.ts
```

## Related

- [OCR Confusion Matrices](./OCR_CONFUSION_MATRICES.md) — the underlying matrix computation service
- [OCR Improvement Pipeline](./OCR_IMPROVEMENT_PIPELINE.md) — uses confusion matrices for tool selection
