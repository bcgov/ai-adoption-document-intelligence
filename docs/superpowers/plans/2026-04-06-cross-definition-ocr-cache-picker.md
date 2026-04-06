# Cross-Definition OCR Cache Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select a cached OCR source run (from any definition sharing the same dataset version) when starting or rerunning a benchmark, with clear traceability of where cached OCR came from.

**Architecture:** New backend endpoint returns completed runs with OCR cache rows for a given dataset version. Backend validation relaxed from definition-match to dataset-version-match. Frontend adds a Select dropdown to both start-run and rerun UIs, plus a cache source badge on the run detail page.

**Tech Stack:** NestJS (backend), Prisma (ORM), React + Mantine (frontend), TanStack Query (data fetching)

---

### Task 1: Backend — OCR Cache Source DTO

**Files:**
- Create: `apps/backend-services/src/benchmark/dto/ocr-cache-source.dto.ts`
- Modify: `apps/backend-services/src/benchmark/dto/index.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// apps/backend-services/src/benchmark/dto/ocr-cache-source.dto.ts
import { ApiProperty } from "@nestjs/swagger";

export class OcrCacheSourceDto {
  @ApiProperty({ description: "Benchmark run ID (the cache source)" })
  id: string;

  @ApiProperty({ description: "Definition ID that produced this run" })
  definitionId: string;

  @ApiProperty({ description: "Human-readable definition name" })
  definitionName: string;

  @ApiProperty({
    description: "When the source run completed",
    type: String,
    format: "date-time",
  })
  completedAt: string;

  @ApiProperty({
    description: "Number of cached OCR samples available from this run",
  })
  sampleCount: number;
}
```

- [ ] **Step 2: Export from dto/index.ts**

Add to `apps/backend-services/src/benchmark/dto/index.ts`:

```typescript
export * from "./ocr-cache-source.dto";
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend-services/src/benchmark/dto/ocr-cache-source.dto.ts apps/backend-services/src/benchmark/dto/index.ts
git commit -m "feat: add OcrCacheSourceDto for cache source endpoint"
```

---

### Task 2: Backend — Service method `listOcrCacheSources`

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-run.service.ts`
- Test: `apps/backend-services/src/benchmark/benchmark-run.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to the existing `describe("BenchmarkRunService")` block in `benchmark-run.service.spec.ts`:

```typescript
describe("listOcrCacheSources", () => {
  it("returns completed runs with cache rows matching the dataset version", async () => {
    (prisma.benchmarkRun.findMany as jest.Mock).mockResolvedValue([
      {
        id: "run-1",
        completedAt: new Date("2026-04-01T00:00:00Z"),
        definition: { id: "def-1", name: "Def A" },
        _count: { ocrCacheRows: 5 },
      },
      {
        id: "run-2",
        completedAt: new Date("2026-03-30T00:00:00Z"),
        definition: { id: "def-2", name: "Def B" },
        _count: { ocrCacheRows: 3 },
      },
    ]);

    const result = await service.listOcrCacheSources("project-1", "ds-version-1");

    expect(prisma.benchmarkRun.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        status: "completed",
        definition: { datasetVersionId: "ds-version-1" },
        ocrCacheRows: { some: {} },
      },
      include: {
        definition: { select: { id: true, name: true } },
        _count: { select: { ocrCacheRows: true } },
      },
      orderBy: { completedAt: "desc" },
    });

    expect(result).toEqual([
      {
        id: "run-1",
        definitionId: "def-1",
        definitionName: "Def A",
        completedAt: "2026-04-01T00:00:00.000Z",
        sampleCount: 5,
      },
      {
        id: "run-2",
        definitionId: "def-2",
        definitionName: "Def B",
        completedAt: "2026-03-30T00:00:00.000Z",
        sampleCount: 3,
      },
    ]);
  });

  it("returns empty array when no cache sources exist", async () => {
    (prisma.benchmarkRun.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.listOcrCacheSources("project-1", "ds-version-1");

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend-services && npx jest --testPathPattern=benchmark-run.service.spec --no-coverage -t "listOcrCacheSources"`
Expected: FAIL — `service.listOcrCacheSources is not a function`

- [ ] **Step 3: Implement the service method**

Add to `apps/backend-services/src/benchmark/benchmark-run.service.ts`:

```typescript
import { OcrCacheSourceDto } from "./dto";
```

Add this method to the `BenchmarkRunService` class:

```typescript
/**
 * List completed runs that have cached OCR rows for a given dataset version.
 * Returns runs across all definitions in the project that share the dataset version.
 */
async listOcrCacheSources(
  projectId: string,
  datasetVersionId: string,
): Promise<OcrCacheSourceDto[]> {
  const runs = await this.prisma.benchmarkRun.findMany({
    where: {
      projectId,
      status: "completed",
      definition: { datasetVersionId },
      ocrCacheRows: { some: {} },
    },
    include: {
      definition: { select: { id: true, name: true } },
      _count: { select: { ocrCacheRows: true } },
    },
    orderBy: { completedAt: "desc" },
  });

  return runs.map((run) => ({
    id: run.id,
    definitionId: run.definition.id,
    definitionName: run.definition.name,
    completedAt: run.completedAt!.toISOString(),
    sampleCount: run._count.ocrCacheRows,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend-services && npx jest --testPathPattern=benchmark-run.service.spec --no-coverage -t "listOcrCacheSources"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-run.service.ts apps/backend-services/src/benchmark/benchmark-run.service.spec.ts
git commit -m "feat: add listOcrCacheSources service method"
```

---

### Task 3: Backend — Controller endpoint `GET ocr-cache-sources`

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-run.controller.ts`

- [ ] **Step 1: Add the endpoint**

Add this method to `BenchmarkRunController` (after the existing `listRuns` method, before `getRunById`):

```typescript
@Get("ocr-cache-sources")
@Identity({ allowApiKey: true })
@ApiOperation({
  summary: "List runs with cached OCR for a dataset version",
  description:
    "Returns completed runs across all definitions in the project that have cached Azure OCR responses " +
    "and share the specified dataset version. Used to populate the cache source picker when starting a run.",
})
@ApiParam({ name: "projectId", description: "Benchmark project ID" })
@ApiQuery({
  name: "datasetVersionId",
  required: true,
  type: String,
  description: "Dataset version ID to match",
})
@ApiOkResponse({
  description: "List of runs with cached OCR",
  type: [OcrCacheSourceDto],
})
@ApiForbiddenResponse({ description: "Access denied: not a group member" })
async listOcrCacheSources(
  @Param("projectId") projectId: string,
  @Query("datasetVersionId") datasetVersionId: string,
  @Req() req: Request,
): Promise<OcrCacheSourceDto[]> {
  this.logger.log(
    `GET /api/benchmark/projects/${projectId}/ocr-cache-sources?datasetVersionId=${datasetVersionId}`,
  );
  await this.assertProjectGroupAccess(projectId, req);
  return this.benchmarkRunService.listOcrCacheSources(
    projectId,
    datasetVersionId,
  );
}
```

Also add `OcrCacheSourceDto` to the import from `"./dto"` at the top of the file.

- [ ] **Step 2: Run type check**

Run: `cd apps/backend-services && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-run.controller.ts
git commit -m "feat: add GET ocr-cache-sources endpoint"
```

---

### Task 4: Backend — Relax `assertOcrCacheBaselineRun` validation

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-run.service.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-run.service.spec.ts`

- [ ] **Step 1: Update the existing replay test**

In `benchmark-run.service.spec.ts`, find the test `"sets persistOcrCache false when ocrCacheBaselineRunId is set (replay)"` (around line 320). The mock for `prisma.benchmarkRun.findFirst` currently checks `w?.definitionId`. Update the condition to match the new query shape which uses `definition: { datasetVersionId }` instead of `definitionId`:

Replace the `mockImplementation` callback:

```typescript
(prisma.benchmarkRun.findFirst as jest.Mock).mockImplementation(
  (args: { where?: Record<string, unknown> }) => {
    const w = args?.where;
    if (
      w?.status === "completed" &&
      w?.definition &&
      w?.id === baselineId
    ) {
      return Promise.resolve({ id: baselineId, status: "completed" });
    }
    return Promise.resolve({
      ...mockRun,
      definition: { name: "Test Definition" },
    });
  },
);
```

- [ ] **Step 2: Add a test for cross-definition cache replay**

Add to the `describe("startRun")` block:

```typescript
it("allows ocrCacheBaselineRunId from a different definition with same datasetVersionId", async () => {
  const baselineId = "c3eb6015-f17f-49c5-80e7-5fdc97a3cbca";
  (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
    mockDefinition,
  );
  (prisma.benchmarkRun.findFirst as jest.Mock).mockImplementation(
    (args: { where?: Record<string, unknown> }) => {
      const w = args?.where;
      if (w?.status === "completed" && w?.id === baselineId) {
        // Different definition, same dataset version — should pass
        return Promise.resolve({ id: baselineId, status: "completed" });
      }
      return Promise.resolve({
        ...mockRun,
        definition: { name: "Test Definition" },
      });
    },
  );
  (prisma.benchmarkRun.create as jest.Mock).mockResolvedValue({
    ...mockRun,
    id: "run-1",
    temporalWorkflowId: "",
  });
  (
    benchmarkTemporal.startBenchmarkRunWorkflow as jest.Mock
  ).mockResolvedValue("benchmark-run-run-1");
  (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
    ...mockRun,
    temporalWorkflowId: "benchmark-run-run-1",
    status: "running",
  });
  (prisma.benchmarkDefinition.update as jest.Mock).mockResolvedValue(
    mockDefinition,
  );

  await service.startRun("project-1", "def-1", {
    ocrCacheBaselineRunId: baselineId,
  });

  expect(benchmarkTemporal.startBenchmarkRunWorkflow).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      ocrCacheBaselineRunId: baselineId,
    }),
  );
});
```

- [ ] **Step 3: Run tests to verify the new test fails**

Run: `cd apps/backend-services && npx jest --testPathPattern=benchmark-run.service.spec --no-coverage -t "allows ocrCacheBaselineRunId from a different definition"`
Expected: FAIL (current code checks `definitionId`)

- [ ] **Step 4: Update `assertOcrCacheBaselineRun`**

In `apps/backend-services/src/benchmark/benchmark-run.service.ts`, replace the `assertOcrCacheBaselineRun` method:

```typescript
private async assertOcrCacheBaselineRun(
  projectId: string,
  datasetVersionId: string,
  baselineRunId: string,
): Promise<void> {
  const run = await this.prisma.benchmarkRun.findFirst({
    where: {
      id: baselineRunId,
      projectId,
      status: "completed",
      definition: { datasetVersionId },
    },
  });
  if (!run) {
    throw new BadRequestException(
      `ocrCacheBaselineRunId "${baselineRunId}" not found, not completed, or does not share the same dataset version`,
    );
  }
}
```

Also update the call site in `startRun` (around line 208-213). Change:

```typescript
await this.assertOcrCacheBaselineRun(
  projectId,
  definitionId,
  dto.ocrCacheBaselineRunId,
);
```

To:

```typescript
await this.assertOcrCacheBaselineRun(
  projectId,
  definition.datasetVersionId,
  dto.ocrCacheBaselineRunId,
);
```

- [ ] **Step 5: Run all benchmark-run service tests**

Run: `cd apps/backend-services && npx jest --testPathPattern=benchmark-run.service.spec --no-coverage`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-run.service.ts apps/backend-services/src/benchmark/benchmark-run.service.spec.ts
git commit -m "feat: relax OCR cache validation to dataset-version match"
```

---

### Task 5: Frontend — `useOcrCacheSources` hook

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/hooks/useRuns.ts`

- [ ] **Step 1: Add the hook**

Add to the end of `apps/frontend/src/features/benchmarking/hooks/useRuns.ts` (before the final `export type` block):

```typescript
interface OcrCacheSource {
  id: string;
  definitionId: string;
  definitionName: string;
  completedAt: string;
  sampleCount: number;
}

export const useOcrCacheSources = (
  projectId: string,
  datasetVersionId: string,
) => {
  const query = useQuery({
    queryKey: ["ocr-cache-sources", projectId, datasetVersionId],
    queryFn: async () => {
      const response = await apiService.get<OcrCacheSource[]>(
        `/benchmark/projects/${projectId}/ocr-cache-sources?datasetVersionId=${datasetVersionId}`,
      );
      return response.data || [];
    },
    enabled: !!projectId && !!datasetVersionId,
  });

  return {
    cacheSources: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
  };
};
```

Also add `OcrCacheSource` to the `export type` block at the bottom of the file.

- [ ] **Step 2: Run type check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/benchmarking/hooks/useRuns.ts
git commit -m "feat: add useOcrCacheSources hook"
```

---

### Task 6: Frontend — Cache source picker on DefinitionDetailView

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx`

- [ ] **Step 1: Add imports and state**

Add to imports:

```typescript
import { useOcrCacheSources } from "../hooks/useRuns";
```

Add `Select` to the existing Mantine import (the file already imports from `@mantine/core`).

Inside the component, after the `persistOcrCache` state (around line 141), add:

```typescript
const [ocrCacheBaselineRunId, setOcrCacheBaselineRunId] = useState<
  string | null
>(null);
const { cacheSources } = useOcrCacheSources(
  definition.projectId,
  definition.datasetVersion.id,
);
```

- [ ] **Step 2: Update `handleStartRun` to pass the baseline run ID**

Replace the existing `handleStartRun`:

```typescript
const handleStartRun = async () => {
  const run = await startRun({
    persistOcrCache,
    ...(ocrCacheBaselineRunId ? { ocrCacheBaselineRunId } : {}),
  });
  navigate(`/benchmarking/projects/${definition.projectId}/runs/${run.id}`);
};
```

- [ ] **Step 3: Add the Select dropdown to the UI**

In the JSX, find the `<Switch>` for "Persist OCR cache" (around line 240). Add the cache source Select immediately after the Switch (before the Start Run button):

```tsx
{cacheSources.length > 0 && (
  <Select
    label="Use cached OCR from"
    placeholder="None (fresh OCR)"
    clearable
    data={cacheSources.map((s) => ({
      value: s.id,
      label: `${s.definitionName} — ${new Date(s.completedAt).toLocaleDateString()} (${s.sampleCount} samples)`,
    }))}
    value={ocrCacheBaselineRunId}
    onChange={setOcrCacheBaselineRunId}
    size="sm"
    styles={{ root: { minWidth: 300 } }}
    data-testid="ocr-cache-source-select"
  />
)}
```

- [ ] **Step 4: Run type check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx
git commit -m "feat: add OCR cache source picker to definition start-run UI"
```

---

### Task 7: Frontend — Cache source picker on RunDetailPage (rerun)

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx`

- [ ] **Step 1: Add imports and state**

Add to imports:

```typescript
import { useOcrCacheSources } from "../hooks/useRuns";
```

Add `Select` to the existing Mantine `@mantine/core` import.

Inside the component, after the `persistOcrCacheOnRerun` state (around line 298), add:

```typescript
const [ocrCacheBaselineRunId, setOcrCacheBaselineRunId] = useState<
  string | null
>(null);
```

After the `useDefinition` call (around line 317), add:

```typescript
const { cacheSources } = useOcrCacheSources(
  projectId,
  definition?.datasetVersion?.id ?? "",
);
```

- [ ] **Step 2: Update `handleRerun` to pass the baseline run ID**

Replace the existing `handleRerun`:

```typescript
const handleRerun = async () => {
  if (!run) return;
  const newRun = await startRun({
    persistOcrCache: persistOcrCacheOnRerun,
    ...(ocrCacheBaselineRunId ? { ocrCacheBaselineRunId } : {}),
  });
  navigate(`/benchmarking/projects/${projectId}/runs/${newRun.id}`);
};
```

- [ ] **Step 3: Add the Select dropdown to the rerun UI**

Find the rerun controls section (around line 655, inside `{canRerun && (...)}` block). Add the Select after the existing Switch and before the Re-run button:

```tsx
{cacheSources.length > 0 && (
  <Select
    label="Use cached OCR from"
    placeholder="None (fresh OCR)"
    clearable
    data={cacheSources.map((s) => ({
      value: s.id,
      label: `${s.definitionName} — ${new Date(s.completedAt).toLocaleDateString()} (${s.sampleCount} samples)`,
    }))}
    value={ocrCacheBaselineRunId}
    onChange={setOcrCacheBaselineRunId}
    size="sm"
    styles={{ root: { minWidth: 300 } }}
    data-testid="rerun-ocr-cache-source-select"
  />
)}
```

- [ ] **Step 4: Check the `DefinitionDetails` type in `useDefinitions.ts`**

Verify that the `DefinitionDetails` interface in `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts` includes `datasetVersion` with an `id` field. If not, the interface returned by `useDefinition` needs to include it. Check the existing interface — the `DefinitionDetailView` component already accesses `definition.datasetVersion.id` so this should already be available.

- [ ] **Step 5: Run type check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx
git commit -m "feat: add OCR cache source picker to rerun UI"
```

---

### Task 8: Frontend — Show cache source on run detail page

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx`

- [ ] **Step 1: Add a cache source badge in the run header**

Find the run header area (around line 531, after the "Run ID:" text). Add a cache source indicator that shows when the run used cached OCR:

```tsx
<Text c="dimmed" size="sm" data-testid="run-id-text">
  Run ID: {run.id}
</Text>
{(run.params as Record<string, unknown>)?.ocrCacheBaselineRunId && (
  <Badge
    color="cyan"
    variant="light"
    size="lg"
    data-testid="ocr-cache-source-badge"
  >
    OCR cached from run{" "}
    {String(
      (run.params as Record<string, unknown>).ocrCacheBaselineRunId,
    ).slice(0, 8)}
    ...
  </Badge>
)}
```

- [ ] **Step 2: Enhance the params table to show a friendly label**

In the params table rendering (around line 1036), enhance the `ocrCacheBaselineRunId` row to be more readable. Replace the generic `Object.entries(run.params).map(...)` block:

```tsx
{Object.entries(run.params).map(([key, value]) => (
  <Table.Tr key={key}>
    <Table.Td fw={500}>
      {key === "ocrCacheBaselineRunId"
        ? "OCR Cache Source Run"
        : key}
    </Table.Td>
    <Table.Td>
      {key === "ocrCacheBaselineRunId" ? (
        <Anchor
          component="button"
          onClick={() =>
            navigate(
              `/benchmarking/projects/${projectId}/runs/${String(value)}`,
            )
          }
        >
          {String(value)}
        </Anchor>
      ) : (
        <Code>{JSON.stringify(value)}</Code>
      )}
    </Table.Td>
  </Table.Tr>
))}
```

Add `Anchor` to the Mantine imports if not already present.

- [ ] **Step 3: Run type check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx
git commit -m "feat: show OCR cache source on run detail page"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs-md/OCR_IMPROVEMENT_PIPELINE.md`

- [ ] **Step 1: Update the OCR cache section**

Update the existing cache documentation to reflect cross-definition support. Find the section about cache flags and update it to note:

1. `ocrCacheBaselineRunId` can reference a run from any definition that shares the same `datasetVersionId`
2. The UI now provides a "Use cached OCR from" dropdown on both the definition start-run page and rerun page
3. The run detail page shows which source run provided the cached OCR

- [ ] **Step 2: Commit**

```bash
git add docs-md/OCR_IMPROVEMENT_PIPELINE.md
git commit -m "docs: update OCR cache docs for cross-definition support"
```

---

### Task 10: Run all tests and type checks

- [ ] **Step 1: Run backend tests**

Run: `cd apps/backend-services && npx jest --testPathPattern=benchmark-run.service.spec --no-coverage`
Expected: All PASS

- [ ] **Step 2: Run backend type check**

Run: `cd apps/backend-services && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run frontend type check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run frontend lint**

Run: `cd apps/frontend && npx eslint src/features/benchmarking --ext .ts,.tsx`
Expected: No errors
