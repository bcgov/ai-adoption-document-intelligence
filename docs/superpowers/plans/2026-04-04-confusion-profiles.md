# Confusion Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8 hardcoded character confusion rules with data-driven confusion profiles — standalone reusable entities that are derived from HITL/benchmark data, curated by operators, and referenced by the character confusion workflow node.

**Architecture:** New `ConfusionProfile` Prisma model scoped to groups. The existing `ConfusionMatrixService` is extended to persist profiles. The `ocr.characterConfusion` Temporal activity loads a profile by ID and converts matrix entries above a frequency threshold into substitution rules. The tool manifest and AI recommendation prompt are updated accordingly.

**Tech Stack:** Prisma (model + migration), NestJS (controller/service), Jest (tests), existing Temporal activity pattern

**Spec:** `docs/superpowers/specs/2026-04-04-field-format-engine-design.md` — Section 2 (Confusion Profiles), Section 4 (AI Content Recommendation Changes)

**Part of:** This is Plan B of 3. Plan A covers Field Format Engine. Plan C covers AI changes.

**Depends on:** Nothing — can be implemented independently of Plan A.

---

### Task 1: Prisma Model + Migration

**Files:**
- Modify: `apps/shared/prisma/schema.prisma`

- [ ] **Step 1: Add ConfusionProfile model to Prisma schema**

Add to `apps/shared/prisma/schema.prisma`, near the existing `Group` relation models:

```prisma
model ConfusionProfile {
  id          String   @id @default(cuid())
  name        String
  description String?
  scope       String?
  matrix      Json
  metadata    Json?
  group_id    String
  group       Group    @relation(fields: [group_id], references: [id])
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@index([group_id])
  @@map("confusion_profiles")
}
```

Add the reverse relation to the `Group` model:

```prisma
// In model Group, add:
confusionProfiles ConfusionProfile[]
```

- [ ] **Step 2: Generate Prisma client and create migration**

Run from `apps/backend-services`:

```bash
npm run db:generate
npx prisma migrate dev --name add_confusion_profiles
```

Expected: Migration SQL file created in `apps/shared/prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 3: Verify migration applied**

Run: `npx prisma migrate status`
Expected: All migrations applied, no pending.

- [ ] **Step 4: Commit**

```bash
git add apps/shared/prisma/schema.prisma apps/shared/prisma/migrations/
git commit -m "feat: add ConfusionProfile Prisma model and migration

Standalone entity for reusable character-level OCR error patterns.
Scoped to groups, stores confusion matrix as JSON."
```

---

### Task 2: Confusion Profile Backend Service

**Files:**
- Create: `apps/backend-services/src/confusion-profile/confusion-profile.service.ts`
- Create: `apps/backend-services/src/confusion-profile/confusion-profile.service.spec.ts`

- [ ] **Step 1: Write failing tests for CRUD operations**

```typescript
// apps/backend-services/src/confusion-profile/confusion-profile.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { ConfusionProfileService } from "./confusion-profile.service";
import { PrismaService } from "../prisma/prisma.service";

describe("ConfusionProfileService", () => {
  let service: ConfusionProfileService;
  let prisma: { confusionProfile: Record<string, jest.Mock>; group: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      confusionProfile: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      group: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfusionProfileService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ConfusionProfileService);
  });

  describe("create", () => {
    it("creates a profile with name, matrix, and group_id", async () => {
      const matrix = { O: { "0": 42 }, l: { "1": 18 } };
      prisma.confusionProfile.create.mockResolvedValue({
        id: "profile-1",
        name: "Test Profile",
        matrix,
        group_id: "group-1",
      });

      const result = await service.create({
        name: "Test Profile",
        matrix,
        groupId: "group-1",
      });

      expect(prisma.confusionProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Test Profile",
          matrix,
          group_id: "group-1",
        }),
      });
      expect(result.id).toBe("profile-1");
    });
  });

  describe("findByGroup", () => {
    it("returns profiles for a group", async () => {
      prisma.confusionProfile.findMany.mockResolvedValue([
        { id: "p1", name: "Profile 1", group_id: "group-1" },
      ]);

      const result = await service.findByGroup("group-1");
      expect(result).toHaveLength(1);
      expect(prisma.confusionProfile.findMany).toHaveBeenCalledWith({
        where: { group_id: "group-1" },
        orderBy: { updated_at: "desc" },
      });
    });
  });

  describe("findById", () => {
    it("returns a profile by ID", async () => {
      prisma.confusionProfile.findUnique.mockResolvedValue({
        id: "p1",
        name: "Profile 1",
        matrix: { O: { "0": 42 } },
      });

      const result = await service.findById("p1");
      expect(result?.id).toBe("p1");
    });

    it("returns null for non-existent ID", async () => {
      prisma.confusionProfile.findUnique.mockResolvedValue(null);
      const result = await service.findById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("updates name, description, and matrix", async () => {
      prisma.confusionProfile.update.mockResolvedValue({
        id: "p1",
        name: "Updated",
      });

      await service.update("p1", {
        name: "Updated",
        description: "New desc",
        matrix: { O: { "0": 50 } },
      });

      expect(prisma.confusionProfile.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: expect.objectContaining({
          name: "Updated",
          description: "New desc",
          matrix: { O: { "0": 50 } },
        }),
      });
    });
  });

  describe("delete", () => {
    it("deletes a profile by ID", async () => {
      prisma.confusionProfile.delete.mockResolvedValue({ id: "p1" });
      await service.delete("p1");
      expect(prisma.confusionProfile.delete).toHaveBeenCalledWith({
        where: { id: "p1" },
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend-services && npx jest confusion-profile.service --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ConfusionProfileService**

```typescript
// apps/backend-services/src/confusion-profile/confusion-profile.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface CreateProfileInput {
  name: string;
  description?: string;
  scope?: string;
  matrix: Record<string, Record<string, number>>;
  metadata?: Record<string, unknown>;
  groupId: string;
}

interface UpdateProfileInput {
  name?: string;
  description?: string;
  scope?: string;
  matrix?: Record<string, Record<string, number>>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ConfusionProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProfileInput) {
    return this.prisma.confusionProfile.create({
      data: {
        name: input.name,
        description: input.description,
        scope: input.scope,
        matrix: input.matrix,
        metadata: input.metadata ?? null,
        group_id: input.groupId,
      },
    });
  }

  async findByGroup(groupId: string) {
    return this.prisma.confusionProfile.findMany({
      where: { group_id: groupId },
      orderBy: { updated_at: "desc" },
    });
  }

  async findById(id: string) {
    return this.prisma.confusionProfile.findUnique({
      where: { id },
    });
  }

  async update(id: string, input: UpdateProfileInput) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.scope !== undefined) data.scope = input.scope;
    if (input.matrix !== undefined) data.matrix = input.matrix;
    if (input.metadata !== undefined) data.metadata = input.metadata;

    return this.prisma.confusionProfile.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.confusionProfile.delete({
      where: { id },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend-services && npx jest confusion-profile.service --no-coverage`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/confusion-profile/
git commit -m "feat: add ConfusionProfileService with CRUD operations"
```

---

### Task 3: Derive Confusion Profile from Data

**Files:**
- Modify: `apps/backend-services/src/confusion-profile/confusion-profile.service.ts`
- Modify: `apps/backend-services/src/confusion-profile/confusion-profile.service.spec.ts`
- Read: `apps/backend-services/src/benchmark/confusion-matrix.service.ts` (for derive logic)

- [ ] **Step 1: Write failing test for deriveAndSave**

Add to the spec file:

```typescript
describe("deriveAndSave", () => {
  let confusionMatrixService: { deriveFromHitlCorrections: jest.Mock; computeFromPairs: jest.Mock };

  beforeEach(() => {
    confusionMatrixService = {
      deriveFromHitlCorrections: jest.fn(),
      computeFromPairs: jest.fn(),
    };
    // Re-create the module with the extra dependency
    // (update the module setup to include ConfusionMatrixService)
  });

  it("derives matrix from HITL corrections and saves as profile", async () => {
    confusionMatrixService.deriveFromHitlCorrections.mockResolvedValue({
      matrix: { O: { "0": 42 }, l: { "1": 18 } },
      totals: { totalConfusions: 60, uniquePairs: 2 },
      metadata: { sampleCount: 100, fieldCount: 300 },
    });

    prisma.confusionProfile.create.mockResolvedValue({
      id: "profile-1",
      name: "Derived Profile",
      matrix: { O: { "0": 42 }, l: { "1": 18 } },
    });

    const result = await service.deriveAndSave({
      name: "Derived Profile",
      groupId: "group-1",
      filters: { groupIds: ["group-1"] },
    });

    expect(confusionMatrixService.deriveFromHitlCorrections).toHaveBeenCalled();
    expect(prisma.confusionProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Derived Profile",
        matrix: { O: { "0": 42 }, l: { "1": 18 } },
      }),
    });
    expect(result.id).toBe("profile-1");
  });
});
```

- [ ] **Step 2: Implement deriveAndSave**

Add to `ConfusionProfileService`:

```typescript
import { ConfusionMatrixService } from "../benchmark/confusion-matrix.service";

// Add to constructor:
constructor(
  private readonly prisma: PrismaService,
  private readonly confusionMatrixService: ConfusionMatrixService,
) {}

async deriveAndSave(input: {
  name: string;
  description?: string;
  scope?: string;
  groupId: string;
  filters: { startDate?: string; endDate?: string; groupIds?: string[]; fieldKeys?: string[] };
}) {
  const result = await this.confusionMatrixService.deriveFromHitlCorrections(
    input.filters,
  );

  return this.create({
    name: input.name,
    description: input.description,
    scope: input.scope,
    matrix: result.matrix,
    metadata: {
      derivedAt: new Date().toISOString(),
      source: "hitl_corrections",
      filters: input.filters,
      totalConfusions: result.totals.totalConfusions,
      uniquePairs: result.totals.uniquePairs,
      sampleCount: result.metadata.sampleCount,
    },
    groupId: input.groupId,
  });
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/backend-services && npx jest confusion-profile.service --no-coverage`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend-services/src/confusion-profile/
git commit -m "feat: add deriveAndSave to ConfusionProfileService

Derives confusion matrix from HITL corrections via existing
ConfusionMatrixService and persists as a reusable ConfusionProfile."
```

---

### Task 4: REST API Controller + DTOs

**Files:**
- Create: `apps/backend-services/src/confusion-profile/confusion-profile.controller.ts`
- Create: `apps/backend-services/src/confusion-profile/dto/create-confusion-profile.dto.ts`
- Create: `apps/backend-services/src/confusion-profile/dto/update-confusion-profile.dto.ts`
- Create: `apps/backend-services/src/confusion-profile/dto/derive-confusion-profile.dto.ts`
- Create: `apps/backend-services/src/confusion-profile/confusion-profile.module.ts`
- Modify: `apps/backend-services/src/app.module.ts` (register module)

- [ ] **Step 1: Create DTOs**

```typescript
// dto/create-confusion-profile.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateConfusionProfileDto {
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() scope?: string;
  @ApiProperty({ type: "object", description: "matrix[trueChar][recognizedChar] = count" })
  matrix: Record<string, Record<string, number>>;
}

// dto/update-confusion-profile.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateConfusionProfileDto {
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() scope?: string;
  @ApiPropertyOptional({ type: "object" })
  matrix?: Record<string, Record<string, number>>;
}

// dto/derive-confusion-profile.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DeriveConfusionProfileDto {
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() scope?: string;
  @ApiPropertyOptional() startDate?: string;
  @ApiPropertyOptional() endDate?: string;
  @ApiPropertyOptional({ type: [String] }) groupIds?: string[];
  @ApiPropertyOptional({ type: [String] }) fieldKeys?: string[];
}
```

- [ ] **Step 2: Create controller**

```typescript
// confusion-profile.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post,
} from "@nestjs/common";
import { ApiTags, ApiOkResponse, ApiNotFoundResponse } from "@nestjs/swagger";
import { ConfusionProfileService } from "./confusion-profile.service";
import { CreateConfusionProfileDto } from "./dto/create-confusion-profile.dto";
import { UpdateConfusionProfileDto } from "./dto/update-confusion-profile.dto";
import { DeriveConfusionProfileDto } from "./dto/derive-confusion-profile.dto";
import { BenchmarkProjectService } from "../benchmark/benchmark-project.service";

@ApiTags("Confusion Profiles")
@Controller("api/benchmark/projects/:projectId/confusion-profiles")
export class ConfusionProfileController {
  constructor(
    private readonly service: ConfusionProfileService,
    private readonly projectService: BenchmarkProjectService,
  ) {}

  @Post("derive")
  @ApiOkResponse({ description: "Derived confusion profile" })
  async derive(
    @Param("projectId") projectId: string,
    @Body() dto: DeriveConfusionProfileDto,
  ) {
    const project = await this.projectService.getProjectOrThrow(projectId);
    return this.service.deriveAndSave({
      name: dto.name,
      description: dto.description,
      scope: dto.scope,
      groupId: project.groupId,
      filters: {
        startDate: dto.startDate,
        endDate: dto.endDate,
        groupIds: dto.groupIds,
        fieldKeys: dto.fieldKeys,
      },
    });
  }

  @Get()
  @ApiOkResponse({ description: "List confusion profiles" })
  async list(@Param("projectId") projectId: string) {
    const project = await this.projectService.getProjectOrThrow(projectId);
    return this.service.findByGroup(project.groupId);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Get confusion profile" })
  @ApiNotFoundResponse({ description: "Profile not found" })
  async get(@Param("id") id: string) {
    return this.service.findById(id);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Updated confusion profile" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateConfusionProfileDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @ApiOkResponse({ description: "Deleted confusion profile" })
  async remove(@Param("id") id: string) {
    return this.service.delete(id);
  }
}
```

- [ ] **Step 3: Create module and register in app**

```typescript
// confusion-profile.module.ts
import { Module } from "@nestjs/common";
import { ConfusionProfileController } from "./confusion-profile.controller";
import { ConfusionProfileService } from "./confusion-profile.service";
import { BenchmarkModule } from "../benchmark/benchmark.module";

@Module({
  imports: [BenchmarkModule],
  controllers: [ConfusionProfileController],
  providers: [ConfusionProfileService],
  exports: [ConfusionProfileService],
})
export class ConfusionProfileModule {}
```

Add to `apps/backend-services/src/app.module.ts` imports array:

```typescript
import { ConfusionProfileModule } from "./confusion-profile/confusion-profile.module";
// In @Module imports:
ConfusionProfileModule,
```

- [ ] **Step 4: Run backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 5: Verify API with curl**

```bash
# List (should return empty array)
curl -s -H "x-api-key: RxKhcS6E3gLhDnL3SlwC0AemiEYiUr7SlwH1s_H1VSA" \
  http://localhost:3002/api/benchmark/projects/6f076fae-c392-4ba1-b59a-559b8b42434e/confusion-profiles

# Derive
curl -s -X POST -H "x-api-key: RxKhcS6E3gLhDnL3SlwC0AemiEYiUr7SlwH1s_H1VSA" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Profile"}' \
  http://localhost:3002/api/benchmark/projects/6f076fae-c392-4ba1-b59a-559b8b42434e/confusion-profiles/derive
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/src/confusion-profile/ apps/backend-services/src/app.module.ts
git commit -m "feat: add ConfusionProfile REST API

CRUD + derive endpoints nested under benchmark projects.
Derives confusion matrix from HITL corrections and persists
as reusable profile."
```

---

### Task 5: Update Character Confusion Activity to Use Profiles

**Files:**
- Modify: `apps/temporal/src/activities/ocr-character-confusion.ts`
- Modify: `apps/temporal/src/activities/ocr-character-confusion.test.ts`

- [ ] **Step 1: Write failing test for profile-driven confusion rules**

Add to `apps/temporal/src/activities/ocr-character-confusion.test.ts`:

```typescript
import * as databaseClient from "../activities/database-client";

describe("profile-driven confusion rules", () => {
  beforeEach(() => {
    // Mock the database client to return a confusion profile
    jest.spyOn(databaseClient, "getPrismaClient").mockReturnValue({
      confusionProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: "profile-1",
          name: "Test Profile",
          matrix: {
            O: { "0": 42 },
            ":": { "1": 5 },
            l: { "1": 18 },
          },
        }),
      },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads profile and applies matrix entries above frequency threshold", async () => {
    const result = await characterConfusionCorrection({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              amount: { content: "7:2O.OO" },
            },
          },
        ],
      },
      confusionProfileId: "profile-1",
      frequencyThreshold: 3,
      applyToAllFields: true,
    });

    const field = result.ocrResult.documents![0].fields.amount as {
      content: string;
    };
    // O->0 (count 42, above threshold 3), :->1 (count 5, above threshold 3), l->1 (count 18, above threshold 3)
    expect(field.content).toBe("7120.00");
  });

  it("skips matrix entries below frequency threshold", async () => {
    const result = await characterConfusionCorrection({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              amount: { content: "7:2O.OO" },
            },
          },
        ],
      },
      confusionProfileId: "profile-1",
      frequencyThreshold: 10,
      applyToAllFields: true,
    });

    const field = result.ocrResult.documents![0].fields.amount as {
      content: string;
    };
    // O->0 (42 >= 10), l->1 (18 >= 10), but :->1 (5 < 10) — colon stays
    expect(field.content).toBe("7:20.00");
  });

  it("falls back to built-in rules when no profile specified", async () => {
    const result = await characterConfusionCorrection({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              sin: { content: "O89714425" },
            },
          },
        ],
      },
      // No confusionProfileId — uses built-in defaults
      applyToAllFields: true,
    });

    const field = result.ocrResult.documents![0].fields.sin as {
      content: string;
    };
    expect(field.content).toBe("089714425");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/temporal && npx jest ocr-character-confusion --no-coverage`
Expected: New tests FAIL (confusionProfileId param not recognized)

- [ ] **Step 3: Implement profile loading and matrix-to-rules conversion**

Modify `apps/temporal/src/activities/ocr-character-confusion.ts`:

```typescript
// Add to CharacterConfusionParams interface:
/** ConfusionProfile ID — loads matrix from database, replaces built-in rules. */
confusionProfileId?: string;
/** Minimum count in confusion matrix for a pair to become a substitution rule. Default: 1 */
frequencyThreshold?: number;

// Add function to load profile and convert to rules:
async function loadConfusionProfileRules(
  profileId: string,
  threshold: number,
): Promise<Record<string, string> | null> {
  const prisma = getPrismaClient();
  const profile = await prisma.confusionProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) return null;

  const matrix = profile.matrix as Record<string, Record<string, number>>;
  const map: Record<string, string> = {};
  for (const [trueChar, recognized] of Object.entries(matrix)) {
    for (const [recognizedChar, count] of Object.entries(recognized)) {
      if (count >= threshold && trueChar !== recognizedChar) {
        // The confusion is: OCR reads trueChar as recognizedChar
        // So the correction is: recognizedChar → trueChar
        map[recognizedChar] = trueChar;
      }
    }
  }
  return Object.keys(map).length > 0 ? map : null;
}

// Modify characterConfusionCorrection to check for profile:
// At the start of the function, before resolving built-in rules:
let profileMap: Record<string, string> | null = null;
if (params.confusionProfileId) {
  const threshold = params.frequencyThreshold ?? 1;
  profileMap = await loadConfusionProfileRules(
    params.confusionProfileId,
    threshold,
  );
}

// Use profileMap instead of built-in rules when available:
// Replace the confusionMapOverride/built-in resolution with:
const useProfile = profileMap !== null;
const useOverride = !useProfile && Boolean(
  params.confusionMapOverride &&
    Object.keys(params.confusionMapOverride).length > 0,
);
```

The `effectiveMapForField` function is updated to use `profileMap` when available, falling back to built-in rules. Schema-aware gating (field type filtering) still applies on top of profile-derived rules.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/temporal && npx jest ocr-character-confusion --no-coverage`
Expected: ALL PASS (new profile tests + existing tests)

- [ ] **Step 5: Run full temporal test suite**

Run: `cd apps/temporal && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add apps/temporal/src/activities/ocr-character-confusion.ts apps/temporal/src/activities/ocr-character-confusion.test.ts
git commit -m "feat: support confusion profile in character confusion activity

Loads confusion matrix from ConfusionProfile entity by ID, converts
entries above frequencyThreshold into substitution rules. Falls back
to built-in rules when no profile specified."
```

---

### Task 6: Update Tool Manifest

**Files:**
- Modify: `apps/backend-services/src/hitl/tool-manifest.service.ts`
- Modify: `apps/backend-services/src/hitl/tool-manifest.service.spec.ts` (if exists)

- [ ] **Step 1: Read current tool manifest**

Read `apps/backend-services/src/hitl/tool-manifest.service.ts` to see the current `ocr.characterConfusion` manifest entry.

- [ ] **Step 2: Update manifest with new parameters**

Add `confusionProfileId` and `frequencyThreshold` parameters to the `ocr.characterConfusion` manifest entry. Mark `enabledRules` and `disabledRules` as deprecated in their descriptions.

```typescript
// In the ocr.characterConfusion tool manifest entry, add:
{
  name: "confusionProfileId",
  type: "string",
  description: "ConfusionProfile entity ID — loads matrix from database. When set, replaces built-in rules.",
  required: false,
},
{
  name: "frequencyThreshold",
  type: "number",
  description: "Minimum count in confusion matrix for a pair to become a substitution rule. Default: 1",
  required: false,
  default: 1,
},
```

- [ ] **Step 3: Run backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend-services/src/hitl/tool-manifest.service.ts
git commit -m "feat: add confusionProfileId and frequencyThreshold to character confusion manifest

New parameters for profile-driven confusion rules. enabledRules and
disabledRules are deprecated but still functional for backward compat."
```

---

### Task 7: Register Character Confusion Activity with New Params

**Files:**
- Read: `apps/temporal/src/activity-registry.ts`
- Modify if needed: ensure the `ocr.characterConfusion` activity registration passes through the new params

- [ ] **Step 1: Verify activity registration**

Read `apps/temporal/src/activity-registry.ts` and check that `ocr.characterConfusion` passes all params through to the activity function. The new `confusionProfileId` and `frequencyThreshold` should flow through `params` automatically if the registry uses a generic params pattern.

- [ ] **Step 2: If changes needed, update and test**

Run: `cd apps/temporal && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 3: Commit if changes were made**

```bash
git add apps/temporal/src/activity-registry.ts
git commit -m "feat: register new confusion profile params in activity registry"
```

---

### Task 8: Full Test Suite + Verification

- [ ] **Step 1: Run backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 2: Run temporal tests**

Run: `cd apps/temporal && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 3: End-to-end verification**

1. Start backend dev server
2. Create a confusion profile via API (derive from existing HITL data)
3. Verify the profile is listed and can be fetched
4. Verify the character confusion tool can reference the profile in a workflow node config

- [ ] **Step 4: Commit any adjustments**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification"
```
