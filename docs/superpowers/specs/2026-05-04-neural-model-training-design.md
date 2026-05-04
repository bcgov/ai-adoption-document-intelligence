# Neural Model Training Mode

## Context

Today, the Template Models feature trains custom Azure Document Intelligence models with `buildMode: "template"` hardcoded in `apps/backend-services/src/training/training.service.ts:430`. We want to also support `buildMode: "neural"`, chosen on a per-training-run basis, fully reusing the existing project / labeling / versioning pipeline.

The system is already on Azure SDK `@azure-rest/ai-document-intelligence@1.1.0` against `api-version=2024-11-30`, so all v4.0 GA features (`buildMode`, `maxTrainingHours`, response `trainingHours`) are available.

## Goals

- Let users pick `template` or `neural` build mode each time they train a TemplateModel.
- Each version of a TemplateModel can be a different mode; mode is recorded as metadata.
- Surface neural-specific Azure constraints (region, quota, free training-hour pool) as informational FYI when the user selects neural.
- Allow users to set a custom `maxTrainingHours` budget for neural builds, with a sensible default of 1 hour.
- Capture the actual `trainingHours` Azure consumed for audit / display.

## Non-Goals (v1)

- Hard pre-checks blocking the Train button on quota = 0 or unsupported region.
- Detecting paid-training subscription capability (Azure rejects requests cleanly when the free pool is exhausted; the existing error path surfaces this).
- The "copy model to another region" workaround for users in unsupported regions.
- Composed models (template + neural under one endpoint).
- Changing the existing versioning naming scheme (`baseModelId` for v1, `baseModelId-v<n>` for v2+).

## Architecture

The change is a thin layer over the existing training pipeline. No new modules; mode is a new field that flows from the request DTO through the service into Azure and gets persisted on the existing `TrainingJob` and `TrainedModel` rows.

### Why per-training-run mode

Versioning already exists per TemplateModel (`@@unique([template_model_id, version])` on `TrainedModel`, with monotonic increment). Mode becomes another column alongside `version`. The "active version" pointer keeps working unchanged. This:

- Lets users A/B compare modes on identical labels.
- Avoids any UI for switching project mode after creation.
- Keeps the Azure model-id naming scheme intact — version numbers monotonically increment regardless of mode, so no naming collisions.

### Data flow

```
User clicks "Train" with mode=neural, maxTrainingHours=2
  → POST /api/template-models/:id/training/train
       { description, buildMode: "neural", maxTrainingHours: 2 }
    → TrainingService.startTraining persists build_mode + max_training_hours on TrainingJob
    → uploadAndTrain sends buildMode + maxTrainingHours in the Azure build request
    → poller sees build_mode=neural, max_training_hours=2,
        applies ceil((2*3600 + 600)/pollInterval) attempt budget
    → on success, TrainedModel row created with build_mode=neural,
        max_training_hours=2, actual_training_hours from Azure GET response,
        version N+1
  → /info FYI banner refreshes (used count went up by 1)
```

## Database Schema

Add a `BuildMode` enum and three columns. All defaulted so existing rows backfill cleanly.

```prisma
enum BuildMode {
  template
  neural
}

model TrainingJob {
  // ... existing fields ...
  build_mode         BuildMode @default(template)
  max_training_hours Float?
}

model TrainedModel {
  // ... existing fields ...
  build_mode            BuildMode @default(template)
  max_training_hours    Float?
  actual_training_hours Float?
}
```

`max_training_hours` is the budget the user requested; `actual_training_hours` is the read-only `trainingHours` Azure returned after the build. Both are `Float?` because:

- They are only meaningful for neural builds.
- `actual_training_hours` is unknown until the build completes successfully.

Migration: standard Prisma migration. Default value `template` is safe because all pre-existing rows were template-mode builds.

## Backend

### `StartTrainingDto`

`apps/backend-services/src/training/dto/start-training.dto.ts`

```ts
export class StartTrainingDto {
  @ApiPropertyOptional({ description: "Optional description for the model" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    enum: BuildMode,
    default: BuildMode.template,
    description: "Azure Document Intelligence build mode",
  })
  @IsEnum(BuildMode)
  @IsOptional()
  buildMode?: BuildMode;

  @ApiPropertyOptional({
    description:
      "Maximum training hours budget for neural builds. Ignored when buildMode=template.",
    minimum: 0.5,
  })
  @IsNumber()
  @Min(0.5)
  @IsOptional()
  maxTrainingHours?: number;
}
```

No upper bound on `maxTrainingHours` — Azure rejects requests above 10h when the free pool is exhausted, and that error is already surfaced as `error_message` on the failed job.

### `TrainingService.startTraining`

`apps/backend-services/src/training/training.service.ts`

- Accept `buildMode` (default `template`) and `maxTrainingHours` from the DTO.
- Persist both on the new `TrainingJob` row.
- In `uploadAndTrain`, pass `buildMode` to the Azure build payload. Include `maxTrainingHours` only when `buildMode === "neural"` AND a value is provided. Drop the field entirely otherwise so Azure uses its default.

```ts
const buildBody: BuildDocumentModelRequest = {
  modelId,
  description: dto.description,
  buildMode: dto.buildMode ?? "template",
  azureBlobSource: { containerUrl: sasUrl },
};
if (dto.buildMode === "neural" && dto.maxTrainingHours !== undefined) {
  buildBody.maxTrainingHours = dto.maxTrainingHours;
}
```

### `TrainingPollerService`

`apps/backend-services/src/training/training-poller.service.ts`

Two changes:

**1. Dynamic max-attempts based on build mode and budget.**

```ts
function computeMaxAttempts(
  job: TrainingJob,
  pollInterval: number,
  templateMaxAttempts: number, // 60 by default → 10 min
): number {
  if (job.build_mode === BuildMode.template) {
    return templateMaxAttempts;
  }
  if (job.max_training_hours == null) {
    return Math.ceil((30 * 60) / pollInterval); // 30 min Azure default
  }
  return Math.ceil((job.max_training_hours * 3600 + 600) / pollInterval);
}
```

10 min buffer on top of `max_training_hours` covers Azure's queueing + finalization overhead.

**2. Capture `trainingHours` from the Azure GET response on success.**

When the operation reports `succeeded`, the poller already fetches the model details. Extend the existing flow to read `trainingHours` from the response and persist it as `actual_training_hours` on the new `TrainedModel` row, alongside copying `build_mode` and `max_training_hours` from the job.

### `/info` proxy endpoint

New endpoint:

```
GET /api/template-models/training/info
```

Calls Azure `GET {endpoint}/documentintelligence/info?api-version=2024-11-30` and returns the relevant fields:

```ts
class TrainingInfoDto {
  region: string;
  customNeuralDocumentModelBuilds: {
    used: number;
    quota: number;
    quotaResetDateTime: string;
  };
  // Pass through any neural training-hours quota fields Azure exposes
  // without app-level interpretation.
}
```

The frontend calls this lazily — only when the user selects "neural" in the TrainingPanel mode selector. Auth: same group-scoped guard as other training endpoints.

If Azure exposes additional neural-related quota fields in `/info` (e.g. a free-hours pool counter) we pass them through verbatim; the FYI banner can surface them without us needing to know the exact shape ahead of time.

## Frontend

### TrainingPanel

`apps/frontend/src/features/annotation/template-models/components/TrainingPanel.tsx`

Add to the "Start Training" Paper:

1. A `SegmentedControl` mode selector: **Template** | **Neural**. Default Template.
2. When Neural is selected:
   - Lazy-fetch `/training/info` and render a Mantine `Alert` (info color) showing region, neural-build quota used/remaining, and any free-hours info Azure provides. Include a sentence: *"The first 10 hours of neural training per month are free and shared across your entire Azure subscription. After 10h, training is billed at $3/hr."*
   - Show a `NumberInput` labelled "Max training hours" pre-filled with `1`. Help text: *"Default 1h. Training stops at this budget and returns the best model so far — it does not fail."*
3. The `Train` button mutation calls `startTraining({ description, buildMode, maxTrainingHours })`.

Hide the `maxTrainingHours` input and `/info` banner when Template is selected.

### Versions tab

`apps/frontend/src/features/annotation/template-models/` — existing Versions table.

Add a "Mode" column. Rendering rules:

- `template` → text badge "template"
- `neural`, in flight → "neural · 2h budget"
- `neural`, completed → "neural · 0.23h used" with `2h budget` in tooltip
- `neural`, failed → "neural · 2h budget"

### Hooks / types

- `useTraining.ts` — extend `startTraining` mutation signature to include `buildMode` and `maxTrainingHours`. Add a new `useTrainingInfo` query hook that fetches `/training/info` (enabled flag: only when neural is selected).
- `types/training.types.ts` — add `BuildMode` enum mirroring the backend, `maxTrainingHours` and `actualTrainingHours` to job/version response types.

## Testing

### Backend unit tests

- `training.service.spec.ts`
  - Persists `build_mode` and `max_training_hours` from the DTO onto the new TrainingJob.
  - Sends `buildMode: "neural"` and `maxTrainingHours: 2` in the Azure build payload when DTO has those values.
  - Drops `maxTrainingHours` from the Azure payload when buildMode is template.
  - Drops `maxTrainingHours` from the Azure payload when buildMode is neural but the value is unset.
- `training-poller.service.spec.ts`
  - Returns 60-attempt budget for template jobs.
  - Returns 180-attempt budget for neural jobs with no `max_training_hours`.
  - Returns `ceil((X*3600 + 600)/pollInterval)`-attempt budget for neural jobs with `max_training_hours = X`.
  - On success, copies `trainingHours` from Azure response onto `TrainedModel.actual_training_hours`.
- `training.controller.spec.ts`
  - `GET /training/info` returns the proxied Azure shape and is group-scoped.
  - `POST /training/train` accepts and validates the new `buildMode` and `maxTrainingHours` fields.

### Frontend tests

- `useTraining` hook test extended for the two new fields on the start-training mutation.

### Manual verification (cannot be automated — requires Azure)

- Train a neural version of an existing template-model project. Verify Azure receives `buildMode: "neural"` and the configured `maxTrainingHours`.
- Verify the Versions tab displays mode + actual hours after success.
- Verify the `/info` FYI banner appears when neural is selected and updates after a successful neural build.

## Out of Scope

- `trainingHours` (the response field) is captured, but no analytics dashboard is built — it just appears on the Versions tab.
- Cost projection (showing "$X estimated" before the user clicks Train) — the free-pool sharing across the whole Azure subscription makes this hard to compute accurately and the user can see actual cost on the Azure portal.
- Field-type compatibility warnings — all current FieldType enum values (`string`, `number`, `date`, `selectionMark`, `signature`) are supported by neural in v4.0 GA per Microsoft's documentation, so no warning surface is needed.
