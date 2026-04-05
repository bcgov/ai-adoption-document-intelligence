# Confusion Profiles

Confusion profiles store character-level confusion matrices with provenance metadata, allowing reuse and comparison across benchmark runs and OCR improvement workflows.

## Data Model

Each `ConfusionProfile` record contains:

| Field       | Type     | Description |
|-------------|----------|-------------|
| id          | String   | CUID primary key |
| name        | String   | Human-readable profile name |
| description | String?  | Optional description |
| scope       | String?  | Optional scope label (e.g. field key or category) |
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
  "scope": "date-fields",
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
