# Workflow Config Overrides for Benchmark Definitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to override workflow configuration (exposed parameters like `modelId`, `confidenceThreshold`) when creating or editing a benchmark definition, with defaults pre-populated from the workflow's `exposedParams`.

**Architecture:** Workflow templates already define `exposedParams` in their `nodeGroups`, each with a `path` (e.g. `ctx.modelId.defaultValue`), `type`, `default`, and optional `options`. We add a `workflowConfigOverrides` JSON column to `BenchmarkDefinition` that stores a `Record<path, value>` map. When a run starts, these overrides are deep-applied to a copy of the workflow config before passing it to Temporal. The frontend shows an editable JSON textarea pre-populated with the default values extracted from the selected workflow's `exposedParams`.

**Tech Stack:** NestJS (backend), Prisma (ORM), React + Mantine (frontend), Temporal (workflow execution), Vitest (testing)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `apps/backend-services/src/benchmark/workflow-config-overrides.ts` | Extract exposed params defaults, validate overrides, apply overrides to config |
| Create | `apps/backend-services/src/benchmark/workflow-config-overrides.spec.ts` | Tests for the above |
| Modify | `apps/shared/prisma/schema.prisma` | Add `workflowConfigOverrides` column to `BenchmarkDefinition` |
| Modify | `apps/backend-services/src/benchmark/dto/create-definition.dto.ts` | Add `workflowConfigOverrides` field |
| Modify | `apps/backend-services/src/benchmark/dto/update-definition.dto.ts` | Add `workflowConfigOverrides` field |
| Modify | `apps/backend-services/src/benchmark/dto/definition-response.dto.ts` | Return `workflowConfigOverrides` in responses |
| Modify | `apps/backend-services/src/benchmark/benchmark-definition.service.ts` | Pass overrides through create/update, validate against workflow |
| Modify | `apps/backend-services/src/benchmark/benchmark-run.service.ts` | Apply overrides to workflow config before passing to Temporal |
| Modify | `apps/backend-services/src/benchmark/benchmark-temporal.service.ts` | No changes needed — already receives `workflowConfig` as `Record<string, unknown>` |
| Modify | `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts` | Add `workflowConfigOverrides` to DTO types |
| Modify | `apps/frontend/src/features/benchmarking/hooks/useWorkflows.ts` | Expose workflow config (nodeGroups) in response |
| Modify | `apps/frontend/src/features/benchmarking/components/CreateDefinitionDialog.tsx` | Add workflow config overrides JSON editor |
| Modify | `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx` | Display config overrides |
| Modify | `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx` | Display effective config overrides in run params |

---

### Task 1: Create the Workflow Config Overrides Utility (Backend)

This utility handles three things: extracting default values from a workflow's `exposedParams`, validating user-supplied overrides against them, and applying overrides to a deep copy of the workflow config.

**Files:**
- Create: `apps/backend-services/src/benchmark/workflow-config-overrides.ts`
- Create: `apps/backend-services/src/benchmark/workflow-config-overrides.spec.ts`

- [ ] **Step 1: Write tests for `extractExposedParamDefaults`**

```typescript
// apps/backend-services/src/benchmark/workflow-config-overrides.spec.ts
import { describe, expect, it } from "vitest";
import {
  extractExposedParamDefaults,
  validateWorkflowConfigOverrides,
  applyWorkflowConfigOverrides,
} from "./workflow-config-overrides";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";

// Minimal workflow config with nodeGroups and exposedParams
const makeWorkflowConfig = (): GraphWorkflowConfig =>
  ({
    schemaVersion: "1.0",
    metadata: { name: "Test Workflow", description: "", tags: [] },
    entryNodeId: "node1",
    ctx: {
      modelId: { type: "string", defaultValue: "prebuilt-layout" },
      confidenceThreshold: {
        type: "number",
        defaultValue: 0.95,
        description: "OCR confidence threshold",
      },
    },
    nodes: {
      node1: {
        id: "node1",
        type: "activity",
        label: "Node 1",
        activityType: "file.prepare",
        parameters: { threshold: 0.95 },
      },
      node2: {
        id: "node2",
        type: "humanGate",
        label: "Human Review",
        signal: { name: "approval", payloadSchema: {} },
        timeout: "24h",
        onTimeout: "fail",
      },
    },
    edges: [],
    nodeGroups: {
      "ocr-extraction": {
        label: "OCR Extraction",
        nodeIds: ["node1"],
        exposedParams: [
          {
            label: "OCR Model",
            path: "ctx.modelId.defaultValue",
            type: "select",
            options: ["prebuilt-layout", "prebuilt-read", "prebuilt-document"],
            default: "prebuilt-layout",
          },
        ],
      },
      "quality-gate": {
        label: "Quality Gate",
        nodeIds: ["node1"],
        exposedParams: [
          {
            label: "Confidence Threshold",
            path: "nodes.node1.parameters.threshold",
            type: "number",
            default: 0.95,
          },
        ],
      },
      "human-review": {
        label: "Human Review",
        nodeIds: ["node2"],
        exposedParams: [
          {
            label: "Review Timeout",
            path: "nodes.node2.timeout",
            type: "duration",
            default: "24h",
          },
        ],
      },
    },
  }) as unknown as GraphWorkflowConfig;

describe("extractExposedParamDefaults", () => {
  it("returns a map of path to default value for all exposed params", () => {
    const config = makeWorkflowConfig();
    const defaults = extractExposedParamDefaults(config);
    expect(defaults).toEqual({
      "ctx.modelId.defaultValue": "prebuilt-layout",
      "nodes.node1.parameters.threshold": 0.95,
      "nodes.node2.timeout": "24h",
    });
  });

  it("returns empty object when no nodeGroups exist", () => {
    const config = makeWorkflowConfig();
    delete (config as Record<string, unknown>).nodeGroups;
    const defaults = extractExposedParamDefaults(config);
    expect(defaults).toEqual({});
  });

  it("skips nodeGroups with no exposedParams", () => {
    const config = makeWorkflowConfig();
    config.nodeGroups!["ocr-extraction"].exposedParams = undefined;
    const defaults = extractExposedParamDefaults(config);
    expect(defaults).not.toHaveProperty("ctx.modelId.defaultValue");
    expect(defaults).toHaveProperty("nodes.node1.parameters.threshold");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend-services && npx vitest run src/benchmark/workflow-config-overrides.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `extractExposedParamDefaults`**

```typescript
// apps/backend-services/src/benchmark/workflow-config-overrides.ts
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";

/**
 * Extract a map of { path: defaultValue } from all exposedParams
 * across the workflow's nodeGroups.
 */
export function extractExposedParamDefaults(
  config: GraphWorkflowConfig,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  if (!config.nodeGroups) {
    return defaults;
  }

  for (const group of Object.values(config.nodeGroups)) {
    if (!group.exposedParams) continue;
    for (const param of group.exposedParams) {
      defaults[param.path] = param.default;
    }
  }

  return defaults;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend-services && npx vitest run src/benchmark/workflow-config-overrides.spec.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Write tests for `validateWorkflowConfigOverrides`**

Append to the test file:

```typescript
describe("validateWorkflowConfigOverrides", () => {
  it("accepts valid overrides matching exposed param paths", () => {
    const config = makeWorkflowConfig();
    const overrides = {
      "ctx.modelId.defaultValue": "prebuilt-read",
      "nodes.node1.parameters.threshold": 0.8,
    };
    const errors = validateWorkflowConfigOverrides(config, overrides);
    expect(errors).toEqual([]);
  });

  it("rejects paths not in exposed params", () => {
    const config = makeWorkflowConfig();
    const overrides = {
      "ctx.modelId.defaultValue": "prebuilt-read",
      "nodes.node1.activityType": "evil.activity",
    };
    const errors = validateWorkflowConfigOverrides(config, overrides);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("nodes.node1.activityType");
  });

  it("rejects select values not in options list", () => {
    const config = makeWorkflowConfig();
    const overrides = {
      "ctx.modelId.defaultValue": "invalid-model",
    };
    const errors = validateWorkflowConfigOverrides(config, overrides);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("invalid-model");
  });

  it("accepts empty overrides", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {});
    expect(errors).toEqual([]);
  });

  it("returns empty array when workflow has no nodeGroups", () => {
    const config = makeWorkflowConfig();
    delete (config as Record<string, unknown>).nodeGroups;
    const errors = validateWorkflowConfigOverrides(config, {
      "ctx.modelId.defaultValue": "anything",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ctx.modelId.defaultValue");
  });
});
```

- [ ] **Step 6: Run test to verify new tests fail**

Run: `cd apps/backend-services && npx vitest run src/benchmark/workflow-config-overrides.spec.ts`
Expected: 5 new tests FAIL

- [ ] **Step 7: Implement `validateWorkflowConfigOverrides`**

Append to `workflow-config-overrides.ts`:

```typescript
/**
 * Validate that overrides only target paths declared in exposedParams,
 * and that select-type params use allowed option values.
 *
 * Returns an array of human-readable error strings. Empty array = valid.
 */
export function validateWorkflowConfigOverrides(
  config: GraphWorkflowConfig,
  overrides: Record<string, unknown>,
): string[] {
  const errors: string[] = [];

  // Build a lookup of valid exposed params by path
  const exposedByPath = new Map<
    string,
    { type: string; options?: string[] }
  >();

  if (config.nodeGroups) {
    for (const group of Object.values(config.nodeGroups)) {
      if (!group.exposedParams) continue;
      for (const param of group.exposedParams) {
        exposedByPath.set(param.path, {
          type: param.type,
          options: param.options,
        });
      }
    }
  }

  for (const [path, value] of Object.entries(overrides)) {
    const param = exposedByPath.get(path);
    if (!param) {
      errors.push(
        `Override path "${path}" is not an exposed configurable parameter`,
      );
      continue;
    }

    // For select-type params, check the value is in the options list
    if (param.type === "select" && param.options) {
      if (!param.options.includes(String(value))) {
        errors.push(
          `Value "${value}" for "${path}" is not in allowed options: ${param.options.join(", ")}`,
        );
      }
    }
  }

  return errors;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/backend-services && npx vitest run src/benchmark/workflow-config-overrides.spec.ts`
Expected: All 8 tests PASS

- [ ] **Step 9: Write tests for `applyWorkflowConfigOverrides`**

Append to the test file:

```typescript
describe("applyWorkflowConfigOverrides", () => {
  it("applies ctx default value overrides", () => {
    const config = makeWorkflowConfig();
    const overrides = { "ctx.modelId.defaultValue": "prebuilt-read" };
    const result = applyWorkflowConfigOverrides(config, overrides);

    // Original should be unchanged
    expect(
      (config.ctx as Record<string, { defaultValue?: unknown }>).modelId
        .defaultValue,
    ).toBe("prebuilt-layout");
    // Result should have the override
    expect(
      (result.ctx as Record<string, { defaultValue?: unknown }>).modelId
        .defaultValue,
    ).toBe("prebuilt-read");
  });

  it("applies node parameter overrides", () => {
    const config = makeWorkflowConfig();
    const overrides = { "nodes.node1.parameters.threshold": 0.8 };
    const result = applyWorkflowConfigOverrides(config, overrides);

    const node = result.nodes["node1"] as Record<string, unknown>;
    const params = node.parameters as Record<string, unknown>;
    expect(params.threshold).toBe(0.8);
  });

  it("applies node-level property overrides", () => {
    const config = makeWorkflowConfig();
    const overrides = { "nodes.node2.timeout": "48h" };
    const result = applyWorkflowConfigOverrides(config, overrides);

    const node = result.nodes["node2"] as Record<string, unknown>;
    expect(node.timeout).toBe("48h");
  });

  it("returns unmodified deep copy when overrides are empty", () => {
    const config = makeWorkflowConfig();
    const result = applyWorkflowConfigOverrides(config, {});
    expect(result).toEqual(config);
    expect(result).not.toBe(config);
  });

  it("applies multiple overrides at once", () => {
    const config = makeWorkflowConfig();
    const overrides = {
      "ctx.modelId.defaultValue": "prebuilt-document",
      "nodes.node1.parameters.threshold": 0.5,
      "nodes.node2.timeout": "1h",
    };
    const result = applyWorkflowConfigOverrides(config, overrides);

    expect(
      (result.ctx as Record<string, { defaultValue?: unknown }>).modelId
        .defaultValue,
    ).toBe("prebuilt-document");
    expect(
      (result.nodes["node1"] as Record<string, unknown>).parameters,
    ).toEqual({ threshold: 0.5 });
    expect((result.nodes["node2"] as Record<string, unknown>).timeout).toBe(
      "1h",
    );
  });
});
```

- [ ] **Step 10: Run test to verify new tests fail**

Run: `cd apps/backend-services && npx vitest run src/benchmark/workflow-config-overrides.spec.ts`
Expected: 5 new tests FAIL

- [ ] **Step 11: Implement `applyWorkflowConfigOverrides`**

Append to `workflow-config-overrides.ts`:

```typescript
/**
 * Apply overrides to a deep copy of the workflow config.
 *
 * Each override key is a dot-separated path (e.g. "ctx.modelId.defaultValue")
 * that is resolved into the config object tree.
 */
export function applyWorkflowConfigOverrides(
  config: GraphWorkflowConfig,
  overrides: Record<string, unknown>,
): GraphWorkflowConfig {
  // Deep clone to avoid mutating the original
  const result = JSON.parse(JSON.stringify(config)) as GraphWorkflowConfig;

  for (const [path, value] of Object.entries(overrides)) {
    setNestedValue(result, path, value);
  }

  return result;
}

/**
 * Set a value at a dot-separated path in an object.
 * E.g. setNestedValue(obj, "a.b.c", 42) sets obj.a.b.c = 42
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === undefined ||
      current[part] === null ||
      typeof current[part] !== "object"
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}
```

- [ ] **Step 12: Run all tests to verify they pass**

Run: `cd apps/backend-services && npx vitest run src/benchmark/workflow-config-overrides.spec.ts`
Expected: All 13 tests PASS

- [ ] **Step 13: Commit**

```bash
git add apps/backend-services/src/benchmark/workflow-config-overrides.ts apps/backend-services/src/benchmark/workflow-config-overrides.spec.ts
git commit -m "feat: add workflow config overrides utility (extract defaults, validate, apply)"
```

---

### Task 2: Add Database Column and Update DTOs

**Files:**
- Modify: `apps/shared/prisma/schema.prisma`
- Modify: `apps/backend-services/src/benchmark/dto/create-definition.dto.ts`
- Modify: `apps/backend-services/src/benchmark/dto/update-definition.dto.ts`
- Modify: `apps/backend-services/src/benchmark/dto/definition-response.dto.ts`

- [ ] **Step 1: Add `workflowConfigOverrides` column to Prisma schema**

In `apps/shared/prisma/schema.prisma`, find the `BenchmarkDefinition` model and add the new field after `workflowConfigHash`:

```prisma
  workflowConfigOverrides Json?               @default("{}")    @map("workflow_config_overrides")
```

The full context — find this block:

```prisma
  workflowConfigHash      String               @map("workflow_config_hash")
  evaluatorType           String               @map("evaluator_type")
```

Replace with:

```prisma
  workflowConfigHash      String               @map("workflow_config_hash")
  workflowConfigOverrides Json?                @default("{}") @map("workflow_config_overrides")
  evaluatorType           String               @map("evaluator_type")
```

- [ ] **Step 2: Generate Prisma client and create migration**

Run:
```bash
cd apps/backend-services && npm run db:generate
cd apps/backend-services && npx prisma migrate dev --name add_workflow_config_overrides
```

Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 3: Update `CreateDefinitionDto` to accept `workflowConfigOverrides`**

In `apps/backend-services/src/benchmark/dto/create-definition.dto.ts`, add after the `workflowId` field:

```typescript
  /**
   * Workflow config overrides — a map of exposed param paths to override values.
   * Keys must match `exposedParams[].path` from the workflow's nodeGroups.
   * Values override the workflow defaults for this benchmark definition.
   */
  @ApiPropertyOptional({
    description:
      "Workflow config overrides — map of exposed param paths to values. " +
      'E.g. {"ctx.modelId.defaultValue": "prebuilt-read"}',
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  workflowConfigOverrides?: Record<string, unknown>;
```

Add `IsOptional` to the imports from `class-validator` and `ApiPropertyOptional` to imports from `@nestjs/swagger`.

- [ ] **Step 4: Update `UpdateDefinitionDto` to accept `workflowConfigOverrides`**

In `apps/backend-services/src/benchmark/dto/update-definition.dto.ts`, add the same field (all fields are already optional in this DTO):

```typescript
  /**
   * Workflow config overrides
   */
  @ApiPropertyOptional({
    description:
      "Workflow config overrides — map of exposed param paths to values",
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  workflowConfigOverrides?: Record<string, unknown>;
```

- [ ] **Step 5: Update definition response DTO to include `workflowConfigOverrides`**

Find `apps/backend-services/src/benchmark/dto/definition-response.dto.ts`. Add a new property to the `DefinitionDetailsDto` class (or whatever DTO returns a full definition):

```typescript
  @ApiPropertyOptional({
    description:
      "Workflow config overrides — map of exposed param paths to values",
    type: "object",
    additionalProperties: true,
  })
  workflowConfigOverrides: Record<string, unknown> | null;
```

Also ensure the mapping from Prisma record to response DTO includes this field.

- [ ] **Step 6: Run existing tests to ensure nothing is broken**

Run: `cd apps/backend-services && npx vitest run`
Expected: All existing tests PASS (new column has a default so existing records are unaffected)

- [ ] **Step 7: Commit**

```bash
git add apps/shared/prisma/schema.prisma apps/shared/prisma/migrations/ apps/backend-services/src/benchmark/dto/
git commit -m "feat: add workflowConfigOverrides column and DTO fields"
```

---

### Task 3: Update Benchmark Definition Service (Create & Update)

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-definition.service.ts`

- [ ] **Step 1: Write test for definition creation with workflow config overrides**

Find the existing definition service test file (likely `benchmark-definition.service.spec.ts`). Add a test:

```typescript
it("should create a definition with workflowConfigOverrides", async () => {
  // Setup: mock workflow that has exposedParams
  const workflowWithExposedParams = {
    ...mockWorkflow,
    config: {
      ...mockWorkflow.config,
      nodeGroups: {
        "ocr-extraction": {
          label: "OCR",
          nodeIds: ["node1"],
          exposedParams: [
            {
              label: "OCR Model",
              path: "ctx.modelId.defaultValue",
              type: "select",
              options: ["prebuilt-layout", "prebuilt-read"],
              default: "prebuilt-layout",
            },
          ],
        },
      },
    },
  };
  // Mock the workflow lookup to return the workflow with exposed params
  // (exact mock depends on existing test infrastructure)

  const dto = {
    name: "Test with overrides",
    datasetVersionId: "version-1",
    workflowId: "workflow-1",
    evaluatorType: "schema-aware",
    evaluatorConfig: {},
    runtimeSettings: { maxParallelDocuments: 10 },
    workflowConfigOverrides: {
      "ctx.modelId.defaultValue": "prebuilt-read",
    },
  };

  const result = await service.createDefinition(projectId, dto, identity);
  expect(result.workflowConfigOverrides).toEqual({
    "ctx.modelId.defaultValue": "prebuilt-read",
  });
});

it("should reject overrides with invalid paths", async () => {
  // Same workflow setup as above
  const dto = {
    name: "Test invalid overrides",
    datasetVersionId: "version-1",
    workflowId: "workflow-1",
    evaluatorType: "schema-aware",
    evaluatorConfig: {},
    runtimeSettings: { maxParallelDocuments: 10 },
    workflowConfigOverrides: {
      "nodes.node1.activityType": "evil.type", // not an exposed param
    },
  };

  await expect(
    service.createDefinition(projectId, dto, identity),
  ).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-definition.service.spec.ts`
Expected: New tests FAIL

- [ ] **Step 3: Update `createDefinition` in `benchmark-definition.service.ts`**

Import the validation utility at the top:

```typescript
import {
  validateWorkflowConfigOverrides,
} from "./workflow-config-overrides";
```

In the `createDefinition` method, after the workflow config hash is computed (around line 121) and before the Prisma create call, add validation:

```typescript
    // Validate workflow config overrides if provided
    const workflowConfigOverrides = dto.workflowConfigOverrides ?? {};
    if (Object.keys(workflowConfigOverrides).length > 0) {
      const overrideErrors = validateWorkflowConfigOverrides(
        workflow.config as GraphWorkflowConfig,
        workflowConfigOverrides,
      );
      if (overrideErrors.length > 0) {
        throw new BadRequestException(
          `Invalid workflow config overrides: ${overrideErrors.join("; ")}`,
        );
      }
    }
```

Then add `workflowConfigOverrides` to the Prisma `create` data object:

```typescript
    workflowConfigOverrides: workflowConfigOverrides as Prisma.InputJsonValue,
```

Also add `workflowConfigOverrides` to the returned object mapping.

- [ ] **Step 4: Update `updateDefinition` similarly**

In the `updateDefinition` method, when `workflowConfigOverrides` is in the DTO, validate against the workflow (either the existing one or the new one if `workflowId` is also being changed). Add the validated overrides to the Prisma update data.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-definition.service.spec.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-definition.service.ts apps/backend-services/src/benchmark/benchmark-definition.service.spec.ts
git commit -m "feat: validate and persist workflowConfigOverrides in definition service"
```

---

### Task 4: Apply Config Overrides When Starting a Run

This is the critical runtime change — when a benchmark run starts, we deep-apply the definition's `workflowConfigOverrides` to the workflow config before passing it to Temporal.

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-run.service.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-run.service.spec.ts` (if it exists)

- [ ] **Step 1: Write test for run starting with config overrides applied**

```typescript
it("should apply workflowConfigOverrides to the workflow config when starting a run", async () => {
  // Mock definition with overrides
  const definitionWithOverrides = {
    ...mockDefinition,
    workflowConfigOverrides: {
      "ctx.modelId.defaultValue": "prebuilt-read",
    },
    workflow: {
      config: {
        schemaVersion: "1.0",
        ctx: {
          modelId: { type: "string", defaultValue: "prebuilt-layout" },
        },
        nodes: {},
        edges: [],
        entryNodeId: "node1",
        metadata: { name: "Test", description: "", tags: [] },
      },
    },
  };
  // Mock runDbService.findBenchmarkDefinitionForRun to return definitionWithOverrides

  await service.startRun(projectId, definitionId, {}, identity);

  // Assert that benchmarkTemporal.startBenchmarkRunWorkflow was called
  // with workflowConfig that has the override applied
  expect(mockBenchmarkTemporal.startBenchmarkRunWorkflow).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      workflowConfig: expect.objectContaining({
        ctx: expect.objectContaining({
          modelId: expect.objectContaining({
            defaultValue: "prebuilt-read",
          }),
        }),
      }),
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-run.service.spec.ts`
Expected: FAIL — overrides not applied

- [ ] **Step 3: Update `startRun` in `benchmark-run.service.ts`**

Import the utility:

```typescript
import { applyWorkflowConfigOverrides } from "./workflow-config-overrides";
```

In the `startRun` method, right before the `startBenchmarkRunWorkflow` call (around line 200), apply overrides to the workflow config:

```typescript
      // Apply workflow config overrides from the definition
      const baseWorkflowConfig = definition.workflow.config as Record<string, unknown>;
      const overrides = (definition.workflowConfigOverrides ?? {}) as Record<string, unknown>;
      const effectiveWorkflowConfig =
        Object.keys(overrides).length > 0
          ? (applyWorkflowConfigOverrides(
              baseWorkflowConfig as unknown as GraphWorkflowConfig,
              overrides,
            ) as unknown as Record<string, unknown>)
          : baseWorkflowConfig;
```

Then use `effectiveWorkflowConfig` instead of `definition.workflow.config` in the call to `startBenchmarkRunWorkflow`:

```typescript
      workflowConfig: effectiveWorkflowConfig,
```

Also store the effective overrides in the run's `params` for traceability:

```typescript
    const run = await this.runDbService.createBenchmarkRun({
      // ... existing fields ...
      params: {
        runtimeSettings: {
          ...(definition.runtimeSettings as Record<string, unknown>),
          ...(dto.runtimeSettingsOverride || {}),
        },
        workflowConfigOverrides: overrides,
      } as Prisma.InputJsonValue,
      // ...
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-run.service.spec.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd apps/backend-services && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-run.service.ts apps/backend-services/src/benchmark/benchmark-run.service.spec.ts
git commit -m "feat: apply workflowConfigOverrides to workflow config when starting benchmark run"
```

---

### Task 5: Update Frontend Types and Hooks

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts`
- Modify: `apps/frontend/src/features/benchmarking/hooks/useWorkflows.ts`

- [ ] **Step 1: Add `workflowConfigOverrides` to frontend definition types**

In `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts`, update the `CreateDefinitionDto` type:

```typescript
export interface CreateDefinitionDto {
  name: string;
  datasetVersionId: string;
  splitId?: string;
  workflowId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  workflowConfigOverrides?: Record<string, unknown>;  // NEW
}
```

Also update `UpdateDefinitionDto` and `DefinitionDetails` to include the field:

```typescript
// In DefinitionDetails interface
workflowConfigOverrides: Record<string, unknown> | null;
```

- [ ] **Step 2: Verify workflow hook returns full config with nodeGroups**

Check `apps/frontend/src/features/benchmarking/hooks/useWorkflows.ts`. The workflow list response likely already includes the `config` field (since it's stored as JSON). If the response type doesn't expose `config`, add it:

```typescript
export interface WorkflowSummary {
  id: string;
  name: string;
  version: number;
  config: {
    nodeGroups?: Record<string, {
      label: string;
      exposedParams?: Array<{
        label: string;
        path: string;
        type: string;
        options?: string[];
        default?: unknown;
      }>;
    }>;
  };
}
```

If the backend workflow list endpoint doesn't return `config`, you may need to add it. Check the workflow controller's list response — if it already returns the full `WorkflowInfo` with `config`, no backend change is needed.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts apps/frontend/src/features/benchmarking/hooks/useWorkflows.ts
git commit -m "feat: add workflowConfigOverrides to frontend types and hooks"
```

---

### Task 6: Update CreateDefinitionDialog with Config Overrides Editor

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/components/CreateDefinitionDialog.tsx`

- [ ] **Step 1: Add state for workflow config overrides**

In `CreateDefinitionDialog`, add state variables after the existing state declarations:

```typescript
const [workflowConfigOverridesJson, setWorkflowConfigOverridesJson] = useState("");
const [workflowConfigOverridesError, setWorkflowConfigOverridesError] = useState("");
```

- [ ] **Step 2: Auto-populate defaults when workflow selection changes**

Add a helper function inside the component that extracts exposed param defaults from a workflow:

```typescript
const getExposedParamDefaults = (
  workflowId: string,
): Record<string, unknown> => {
  const workflow = workflows.find((w) => w.id === workflowId);
  if (!workflow?.config?.nodeGroups) return {};

  const defaults: Record<string, unknown> = {};
  for (const group of Object.values(workflow.config.nodeGroups)) {
    if (!group.exposedParams) continue;
    for (const param of group.exposedParams) {
      defaults[param.path] = param.default;
    }
  }
  return defaults;
};
```

Update the workflow `onChange` handler to populate the JSON textarea:

```typescript
onChange={(value) => {
  setWorkflowId(value || "");
  setWorkflowError("");
  // Auto-populate workflow config overrides with defaults
  if (value) {
    const defaults = getExposedParamDefaults(value);
    if (Object.keys(defaults).length > 0) {
      setWorkflowConfigOverridesJson(JSON.stringify(defaults, null, 2));
    } else {
      setWorkflowConfigOverridesJson("");
    }
  } else {
    setWorkflowConfigOverridesJson("");
  }
  setWorkflowConfigOverridesError("");
}}
```

- [ ] **Step 3: Add the JSON textarea to the form (after the Workflow select)**

```tsx
{workflowConfigOverridesJson && (
  <Stack gap={4}>
    <Textarea
      label={
        <Group gap={4} wrap="nowrap" style={{ display: "inline-flex" }}>
          <Text size="sm" fw={500}>
            Workflow Config Overrides (JSON)
          </Text>
          <Tooltip
            label="Override workflow parameters like OCR model, confidence threshold, etc. Keys are parameter paths from the workflow's exposed parameters."
            multiline
            w={300}
          >
            <IconInfoCircle
              size={14}
              style={{ opacity: 0.6, cursor: "help" }}
            />
          </Tooltip>
        </Group>
      }
      placeholder="{}"
      value={workflowConfigOverridesJson}
      onChange={(e) => {
        setWorkflowConfigOverridesJson(e.target.value);
        setWorkflowConfigOverridesError("");
      }}
      error={workflowConfigOverridesError}
      minRows={4}
      autosize
      styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
      data-testid="workflow-config-overrides-textarea"
    />
  </Stack>
)}
```

- [ ] **Step 4: Update the submit handler to include overrides**

In `handleSubmit`, add validation for the JSON and include it in the output:

```typescript
// Validate workflow config overrides JSON
let workflowConfigOverrides: Record<string, unknown> = {};
if (workflowConfigOverridesJson.trim()) {
  try {
    workflowConfigOverrides = JSON.parse(workflowConfigOverridesJson);
  } catch {
    setWorkflowConfigOverridesError("Invalid JSON");
    hasError = true;
  }
}
```

Then include in the `onCreate` call:

```typescript
onCreate({
  name,
  datasetVersionId,
  ...(splitId ? { splitId } : {}),
  workflowId,
  evaluatorType,
  evaluatorConfig,
  runtimeSettings,
  ...(Object.keys(workflowConfigOverrides).length > 0
    ? { workflowConfigOverrides }
    : {}),
});
```

- [ ] **Step 5: Update `CreateDefinitionFormData` interface**

```typescript
export interface CreateDefinitionFormData {
  name: string;
  datasetVersionId: string;
  splitId?: string;
  workflowId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  workflowConfigOverrides?: Record<string, unknown>;  // NEW
}
```

Also update `DefinitionFormInitialValues`:

```typescript
export interface DefinitionFormInitialValues {
  name: string;
  datasetVersionId: string;
  splitId?: string;
  workflowId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  workflowConfigOverrides?: Record<string, unknown>;  // NEW
}
```

- [ ] **Step 6: Populate overrides when editing an existing definition**

In the `useEffect` that initializes edit mode values (around line 93-133), add:

```typescript
if (initialValues.workflowConfigOverrides && Object.keys(initialValues.workflowConfigOverrides).length > 0) {
  setWorkflowConfigOverridesJson(
    JSON.stringify(initialValues.workflowConfigOverrides, null, 2),
  );
} else {
  // If editing and no overrides saved, populate from workflow defaults
  const defaults = getExposedParamDefaults(initialValues.workflowId);
  if (Object.keys(defaults).length > 0) {
    setWorkflowConfigOverridesJson(JSON.stringify(defaults, null, 2));
  }
}
```

- [ ] **Step 7: Reset overrides in `handleClose`**

Add to the reset block:

```typescript
setWorkflowConfigOverridesJson("");
setWorkflowConfigOverridesError("");
```

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/benchmarking/components/CreateDefinitionDialog.tsx
git commit -m "feat: add workflow config overrides JSON editor to CreateDefinitionDialog"
```

---

### Task 7: Display Config Overrides in DefinitionDetailView and RunDetailPage

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx`
- Modify: `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx`

- [ ] **Step 1: Show config overrides in DefinitionDetailView**

In the definition details card, after the existing workflow config hash display, add a section that shows the overrides if present:

```tsx
{definition.workflowConfigOverrides &&
  Object.keys(definition.workflowConfigOverrides).length > 0 && (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Workflow Config Overrides
      </Text>
      <Code block style={{ fontSize: 13 }}>
        {JSON.stringify(definition.workflowConfigOverrides, null, 2)}
      </Code>
    </Stack>
  )}
```

Also pass the overrides into `DefinitionFormInitialValues` when opening the edit dialog.

- [ ] **Step 2: Show effective overrides in RunDetailPage params section**

The run's `params` already includes `workflowConfigOverrides` (added in Task 4). The RunDetailPage already displays `run.params` as a key-value table. If the existing display handles nested objects, no change is needed. If it only shows flat values, add a dedicated subsection:

```tsx
{run.params?.workflowConfigOverrides &&
  Object.keys(run.params.workflowConfigOverrides as Record<string, unknown>).length > 0 && (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Workflow Config Overrides
      </Text>
      <Code block style={{ fontSize: 13 }}>
        {JSON.stringify(run.params.workflowConfigOverrides, null, 2)}
      </Code>
    </Stack>
  )}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx
git commit -m "feat: display workflow config overrides in definition and run detail views"
```

---

### Task 8: Update Documentation

**Files:**
- Modify: `docs-md/` (appropriate benchmarking docs)

- [ ] **Step 1: Update benchmarking documentation**

Add a section to the relevant docs file in `docs-md/` describing the workflow config overrides feature:

- What it is: ability to override exposed workflow parameters per-definition
- How it works: the definition stores overrides as a JSON map of `path -> value`
- Available paths come from the workflow's `nodeGroups[].exposedParams[].path`
- Overrides are validated against the workflow's exposed params on create/update
- When a run starts, overrides are deep-applied to a copy of the workflow config
- The effective overrides are stored in the run's `params.workflowConfigOverrides` for traceability

- [ ] **Step 2: Commit**

```bash
git add docs-md/
git commit -m "docs: document workflow config overrides feature for benchmarking"
```

---

## Summary of Data Flow

```
CreateDefinitionDialog
  ├── User selects workflow → exposed param defaults populate JSON editor
  ├── User edits JSON (e.g. changes modelId)
  └── Submit → POST /definitions with workflowConfigOverrides

BenchmarkDefinition (DB)
  └── workflowConfigOverrides: {"ctx.modelId.defaultValue": "prebuilt-read"}

Start Run → benchmark-run.service.ts
  ├── Reads definition.workflowConfigOverrides
  ├── Calls applyWorkflowConfigOverrides(workflow.config, overrides)
  ├── Passes effectiveWorkflowConfig to Temporal
  └── Stores overrides in run.params.workflowConfigOverrides

Temporal benchmark-workflow.ts
  └── Receives modified workflowConfig with overrides baked in
      └── benchmarkExecuteWorkflow → graphWorkflow (per sample)
          └── graph-engine initializes ctx from modified config defaults
```
