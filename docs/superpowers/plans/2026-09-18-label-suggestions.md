# Label Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rule-based label suggestion engine with LLM suggestions that work for any form: suggested fields from the first uploaded document, and suggested labels on every document.

**Architecture:** The stored layout OCR is rendered as text with a tag at the start of every line and table cell and in place of every checkbox (`[L12]`, `[T2 r3 c1]`, `[S4 ☒]`). An Azure OpenAI chat model, called through the Vercel AI SDK with a strict reply schema, answers with tags plus the value's exact text. A resolver maps those back to the OCR element ids the labelling screen already uses. The existing `POST …/suggestions` endpoint keeps its response shape, so the labelling screen needs no changes. The Field schema tab gains a description column and a "Suggest fields" flow.

**Tech Stack:** NestJS, Prisma, Vercel AI SDK (`ai` 6.0.191, `@ai-sdk/azure` 3.0.66), zod 3.25.76 through its `zod/v4` entry point, jest (backend), React + Mantine + B.C. Design System adapters, TanStack Query, vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-09-18-label-suggestions-design.md`

**Order of execution:** Execute `docs/superpowers/plans/2026-09-18-label-suggestions-bench.md` first. Its baseline run scores the current engine, and Task 7 of this plan deletes that engine.

## Global Constraints

- **Branch.** Work on `feature/label-drafting`, which is based on `feature/workflow-builder-cumulative`. Stage only the paths a task lists. Never run `git add -A` or `git add .`: `docs-md/workflows/FEATURE_DEMO_GUIDE.md` has an unrelated uncommitted edit that must stay uncommitted.
- **No installs.** Never run `npm install`, `npm ci`, `npx playwright install` or any other installer. Every library this plan uses is already installed at the repo root.
- **Code rules** (from `CLAUDE.md`):
  - no `any` types;
  - no placeholders or stubs;
  - no backwards-compatibility shims;
  - nothing specific to one form.
- **zod.** Backend code that touches the AI SDK imports `{ z } from "zod/v4"`. The plain `"zod"` entry point is zod's v3 API, and with `ai` 6 it makes TypeScript fail with TS2589 (instantiation excessively deep).
- **AI SDK usage:**
  - Call `generateText({ model, system, prompt, output: Output.object({ schema, name }), abortSignal: AbortSignal.timeout(120_000) })` and read `result.output`. `generateObject` is deprecated.
  - Build the model with `createAzure({ apiKey, baseURL: "<endpoint>/openai", useDeploymentBasedUrls: true, apiVersion }).chat(deployment)`.
  - Send no `temperature`, because reasoning deployments reject it.
- **Settings.**
  - `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_DEPLOYMENT` are required.
  - `AZURE_OPENAI_API_VERSION` defaults to `2024-10-21`.
  - If any required setting is missing, respond 503, naming the missing setting names and never their values.
- **Errors:**

  | Status | When | How |
  |---|---|---|
  | 404 | template model, document or OCR result missing | `NotFoundException` |
  | 403 | caller is not in the model's group | `identityCanAccessGroup` |
  | 422 | no fields, or the document is too long | `new HttpException({ message }, HttpStatus.UNPROCESSABLE_ENTITY)` |
  | 502 | the model call failed | `new HttpException({ message, reason }, HttpStatus.BAD_GATEWAY)` |
  | 503 | suggestions aren't configured | `ServiceUnavailableException` |

  "Too long" means over 30 pages, or over 120,000 characters of tagged text. Never log document text or model replies.
- **Element ids** are `p{pageNumber}-w{index}` and `p{pageNumber}-sm{index}`. The index is the element's position in `pages[].words` or `pages[].selectionMarks`. Elements whose polygon has fewer than 8 numbers are skipped, as the labelling screen does.
- **Swagger.** Every endpoint gets specific response decorators and dedicated DTO classes.
- **Transactions and audit.** Operations with more than one write run in `prismaService.transaction`, and their audit events are written through the same `tx`.
- **Running backend tests.** `cd apps/backend-services && npm test -- <path>`. The script uses `--passWithNoTests`, so a mistyped path passes green; always check that the `Tests:` line shows the expected count.
- **Running frontend tests.** `cd apps/frontend && npx vitest run <path>`.
- **If ts-jest runs out of memory** on a spec that imports `ai`, add this entry to `"transform"` in `apps/backend-services/package.json`, before the `"^.+\\.(t|j)s$"` entry, with the same value `src/agent/` uses:
  ```json
  "src/template-model/label-suggestions/.*\\.(t|j)s$": ["@swc/jest", { "jsc": { "parser": { "syntax": "typescript", "decorators": true, "dynamicImport": true }, "transform": { "legacyDecorator": true, "decoratorMetadata": true }, "target": "es2022" }, "module": { "type": "commonjs" } }]
  ```
- **Commits** end with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Field description column

**Files:**
- Modify: `apps/shared/prisma/schema.prisma` (`model FieldDefinition`)
- Create: `apps/shared/prisma/migrations/20260918000000_add_field_definition_description/migration.sql`
- Modify: `apps/backend-services/src/template-model/template-model-db.service.ts` (`createFieldDefinition`, `updateFieldDefinition`)
- Modify: `apps/backend-services/src/template-model/dto/field-definition.dto.ts`
- Modify: `apps/backend-services/src/template-model/dto/template-model-responses.dto.ts` (`FieldDefinitionResponseDto`)
- Modify: `apps/backend-services/src/template-model/template-model.service.ts` (`addField`, `updateField`)
- Test: `apps/backend-services/src/template-model/template-model.service.spec.ts`

**Interfaces:**
- Produces: `FieldDefinition.description: string | null` on the Prisma model. Optional `description?: string` on `CreateFieldDefinitionDto` and `UpdateFieldDefinitionDto`, at most 500 characters. `description?: string | null` on the `createFieldDefinition` / `updateFieldDefinition` data. Blank descriptions are stored as `null`.

- [ ] **Step 1: Write the failing tests**

Add this block inside `describe("TemplateModelService", …)` in `template-model.service.spec.ts`, after the last `describe` block. `FieldType` there is the DTO enum, which the spec already imports from `./dto/field-definition.dto`.

```ts
  describe("field descriptions", () => {
    it("stores a trimmed description when adding a field", async () => {
      mockTemplateModelDbService.findTemplateModel.mockResolvedValueOnce(
        mockTemplateModel,
      );
      mockTemplateModelDbService.createFieldDefinition.mockResolvedValueOnce({
        ...mockTemplateModel.field_schema[0],
        id: "field-2",
        field_key: "filing_date",
        description: "Date at the bottom of the form",
      });

      await service.addField(
        "tm-1",
        {
          field_key: "filing_date",
          field_type: FieldType.DATE,
          description: "  Date at the bottom of the form  ",
        },
        "actor-1",
      );

      expect(
        mockTemplateModelDbService.createFieldDefinition,
      ).toHaveBeenCalledWith(
        "tm-1",
        expect.objectContaining({
          description: "Date at the bottom of the form",
        }),
      );
    });

    it("clears the description when an update sends only whitespace", async () => {
      mockTemplateModelDbService.findTemplateModel.mockResolvedValueOnce(
        mockTemplateModel,
      );
      mockTemplateModelDbService.updateFieldDefinition.mockResolvedValueOnce(
        mockTemplateModel.field_schema[0],
      );

      await service.updateField(
        "tm-1",
        "field-1",
        { description: "   " },
        "actor-1",
      );

      expect(
        mockTemplateModelDbService.updateFieldDefinition,
      ).toHaveBeenCalledWith(
        "field-1",
        "tm-1",
        expect.objectContaining({ description: null }),
      );
    });

    it("leaves the description alone when an update omits it", async () => {
      mockTemplateModelDbService.findTemplateModel.mockResolvedValueOnce(
        mockTemplateModel,
      );
      mockTemplateModelDbService.updateFieldDefinition.mockResolvedValueOnce(
        mockTemplateModel.field_schema[0],
      );

      await service.updateField("tm-1", "field-1", { display_order: 3 }, "actor-1");

      const data =
        mockTemplateModelDbService.updateFieldDefinition.mock.calls[0][2];
      expect(data.description).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend-services && npm test -- src/template-model/template-model.service.spec.ts`
Expected: FAIL. ts-jest reports `Object literal may only specify known properties, and 'description' does not exist in type 'CreateFieldDefinitionDto'`.

- [ ] **Step 3: Add the column and migration**

In `apps/shared/prisma/schema.prisma`, `model FieldDefinition`, add the `description` line after `format_spec`:

```prisma
  format_spec       String?       // JSON format spec for normalization/validation
  /// One-line plain-English description of the field, used as instructions when an LLM suggests fields and labels.
  description       String?
  display_order     Int           @default(0)
```

Create `apps/shared/prisma/migrations/20260918000000_add_field_definition_description/migration.sql`:

```sql
-- A plain-English description of each field, used as instructions when an LLM
-- suggests fields and labels. Optional: existing fields keep a null description.
ALTER TABLE "field_definitions" ADD COLUMN "description" TEXT;
```

Run: `cd apps/backend-services && npm run db:generate`
Expected: it finishes without errors and regenerates the Prisma client in `apps/backend-services/src/generated` and `apps/temporal/src/generated`. Both folders are git-ignored.

With the local Postgres running, apply the migration:
Run: `cd apps/backend-services && npm run db:migrate`
Expected: `Applying migration 20260918000000_add_field_definition_description`, then `All migrations have been successfully applied.`

- [ ] **Step 4: Carry the description through the db service**

In `template-model-db.service.ts`, `createFieldDefinition`, extend the `data` parameter type and the create call:

```ts
    data: {
      field_key: string;
      field_type: FieldType;
      field_format?: string;
      format_spec?: string;
      description?: string | null;
      display_order?: number;
    },
```

```ts
    return client.fieldDefinition.create({
      data: {
        template_model_id: templateModelId,
        field_key: data.field_key,
        field_type: data.field_type,
        field_format: data.field_format,
        format_spec: data.format_spec,
        description: data.description ?? null,
        display_order: data.display_order,
      },
    });
```

In `updateFieldDefinition`, extend the `data` parameter type. The body already passes `data` straight to `updateMany`, which ignores `undefined` fields.

```ts
    data: {
      field_format?: string;
      format_spec?: string;
      description?: string | null;
      display_order?: number;
    },
```

- [ ] **Step 5: Add the DTO properties**

In `dto/field-definition.dto.ts`, change the validator import to include `MaxLength`:

```ts
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
```

Add this property to both `CreateFieldDefinitionDto` and `UpdateFieldDefinitionDto`, directly before `display_order`:

```ts
  @ApiPropertyOptional({
    description:
      "One-line plain-English description of what the field is and where it sits on the form. Used as instructions when an LLM suggests fields and labels; not exported to training files. Blank clears it.",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
```

In `dto/template-model-responses.dto.ts`, `FieldDefinitionResponseDto`, add this after `field_format`:

```ts
  @ApiPropertyOptional({ nullable: true, type: String })
  description?: string | null;
```

- [ ] **Step 6: Pass the description through the service**

In `template-model.service.ts`, add this module-level function above `@Injectable()`:

```ts
/** Trims a field description; blank becomes null, and an absent one stays absent. */
function normalizeDescription(
  value: string | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

In `addField`, add `description` to the `createFieldDefinition` data:

```ts
      {
        field_key: dto.field_key,
        field_type: dto.field_type as unknown as FieldType,
        field_format: dto.field_format,
        format_spec: dto.format_spec,
        description: normalizeDescription(dto.description),
        display_order: dto.display_order,
      },
```

In `updateField`, add `description` to the `updateFieldDefinition` data:

```ts
      {
        field_format: dto.field_format,
        format_spec: dto.format_spec,
        description: normalizeDescription(dto.description),
        display_order: dto.display_order,
      },
```

- [ ] **Step 7: Run the tests and the type-check**

Run: `cd apps/backend-services && npm test -- src/template-model src/hitl src/training`
Expected: PASS, including the 3 new tests.

Some specs build `FieldDefinition` objects by hand. If ts-jest reports `Property 'description' is missing in type … but required in type 'FieldDefinition'` for any of them, add `description: null,` to that object literal and re-run. Candidates found by grep: `hitl/hitl.service.spec.ts`, `hitl/review-db.service.spec.ts`, `template-model/format-suggestion.service.spec.ts`, `template-model/suggestion.service.spec.ts`, `template-model/suggestion.service.integration.spec.ts`, `training/training.service.spec.ts`.

Run: `cd apps/backend-services && npm run type-check`
Expected: exits 0. Fix any remaining `description` omissions the same way.

- [ ] **Step 8: Commit**

```bash
git add apps/shared/prisma/schema.prisma \
  apps/shared/prisma/migrations/20260918000000_add_field_definition_description/migration.sql \
  apps/backend-services/src/template-model/template-model-db.service.ts \
  apps/backend-services/src/template-model/dto/field-definition.dto.ts \
  apps/backend-services/src/template-model/dto/template-model-responses.dto.ts \
  apps/backend-services/src/template-model/template-model.service.ts \
  apps/backend-services/src/template-model/template-model.service.spec.ts
# plus any spec files Step 7 touched
git commit -m "feat(template-model): optional description on each field

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Bulk field creation endpoint

**Files:**
- Modify: `apps/backend-services/src/template-model/dto/field-definition.dto.ts`
- Modify: `apps/backend-services/src/template-model/template-model.service.ts`
- Modify: `apps/backend-services/src/template-model/template-model.controller.ts`
- Test: `apps/backend-services/src/template-model/template-model.service.spec.ts`
- Test: `apps/backend-services/src/template-model/template-model.controller.spec.ts`

**Interfaces:**
- Consumes: the Task 1 `description` support in `createFieldDefinition`.
- Produces:
  - `CreateFieldDefinitionsDto { fields: CreateFieldDefinitionDto[] }`, with 1–200 items.
  - `TemplateModelService.addFields(templateModelId: string, dto: CreateFieldDefinitionsDto, actorId?: string): Promise<FieldDefinition[]>`.
  - `POST /api/template-models/:id/fields/bulk`, returning 201 with the fields in request order. It returns 409 with `{ message, field_keys }` when a key exists or repeats.

- [ ] **Step 1: Write the failing service tests**

In `template-model.service.spec.ts`:

1. Add `let mockAuditService: { recordEvent: jest.Mock };` and `let mockPrismaService: { transaction: jest.Mock };` next to the other `let` declarations at the top of the `describe`.
2. At the end of `beforeEach`, after `mockSuggestionService = module.get(SuggestionService);`, add:

```ts
    mockAuditService = module.get(AuditService);
    mockPrismaService = module.get(PrismaService);
```

Then add this block after the Task 1 block:

```ts
  describe("addFields", () => {
    it("creates the fields in one transaction after the current last order, audited through the transaction", async () => {
      mockTemplateModelDbService.findTemplateModel.mockResolvedValueOnce(
        mockTemplateModel,
      );
      mockTemplateModelDbService.createFieldDefinition
        .mockResolvedValueOnce({
          ...mockTemplateModel.field_schema[0],
          id: "field-2",
          field_key: "file_number",
        })
        .mockResolvedValueOnce({
          ...mockTemplateModel.field_schema[0],
          id: "field-3",
          field_key: "consents",
          field_type: PrismaFieldType.selectionMark,
        });

      const created = await service.addFields(
        "tm-1",
        {
          fields: [
            {
              field_key: "file_number",
              field_type: FieldType.STRING,
              description: "Court file number",
            },
            { field_key: "consents", field_type: FieldType.SELECTION_MARK },
          ],
        },
        "actor-1",
      );

      expect(created.map((f) => f.field_key)).toEqual([
        "file_number",
        "consents",
      ]);
      expect(mockPrismaService.transaction).toHaveBeenCalledTimes(1);
      expect(
        mockTemplateModelDbService.createFieldDefinition,
      ).toHaveBeenNthCalledWith(
        1,
        "tm-1",
        expect.objectContaining({
          field_key: "file_number",
          description: "Court file number",
          display_order: 1,
        }),
        {},
      );
      expect(
        mockTemplateModelDbService.createFieldDefinition,
      ).toHaveBeenNthCalledWith(
        2,
        "tm-1",
        expect.objectContaining({ field_key: "consents", display_order: 2 }),
        {},
      );
      expect(mockAuditService.recordEvent).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            event_type: "template_model_field_created",
            resource_id: "tm-1",
            payload: { field_id: "field-2", field_key: "file_number" },
          }),
          expect.objectContaining({
            payload: { field_id: "field-3", field_key: "consents" },
          }),
        ],
        {},
      );
    });

    it("refuses keys that already exist or repeat, naming them", async () => {
      mockTemplateModelDbService.findTemplateModel.mockResolvedValueOnce(
        mockTemplateModel,
      );

      const error = await service
        .addFields("tm-1", {
          fields: [
            { field_key: "invoice_number", field_type: FieldType.STRING },
            { field_key: "total", field_type: FieldType.NUMBER },
            { field_key: "total", field_type: FieldType.NUMBER },
          ],
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual(
        expect.objectContaining({ field_keys: ["invoice_number", "total"] }),
      );
      expect(
        mockTemplateModelDbService.createFieldDefinition,
      ).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown template model", async () => {
      mockTemplateModelDbService.findTemplateModel.mockResolvedValueOnce(null);
      await expect(
        service.addFields("missing", {
          fields: [{ field_key: "a", field_type: FieldType.STRING }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: Write the failing controller tests**

In `template-model.controller.spec.ts`:

1. Add `addFields: jest.fn(),` to the `templateModelService` mock object (after `addField: jest.fn(),`).
2. Add `import { FieldType } from "./dto/field-definition.dto";`.
3. Add this block inside the top-level `describe`:

```ts
  describe("addFields", () => {
    it("checks group access and passes the actor to the service", async () => {
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      templateModelService.addFields.mockResolvedValue([]);
      const req = {
        resolvedIdentity: {
          actorId: "actor-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const dto = {
        fields: [{ field_key: "a", field_type: FieldType.STRING }],
      };

      await controller.addFields("tm-1", dto, req);

      expect(templateModelService.addFields).toHaveBeenCalledWith(
        "tm-1",
        dto,
        "actor-1",
      );
    });

    it("refuses a caller outside the template model's group", async () => {
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      const req = {
        resolvedIdentity: {
          actorId: "actor-2",
          isSystemAdmin: false,
          groupRoles: { "group-2": GroupRole.MEMBER },
        },
      } as unknown as Request;

      await expect(
        controller.addFields(
          "tm-1",
          { fields: [{ field_key: "a", field_type: FieldType.STRING }] },
          req,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.addFields).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/backend-services && npm test -- src/template-model/template-model.service.spec.ts src/template-model/template-model.controller.spec.ts`
Expected: FAIL. `Property 'addFields' does not exist on type 'TemplateModelService'`.

- [ ] **Step 4: Add the DTO**

In `dto/field-definition.dto.ts`, extend the imports and append the class:

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
```

```ts
export class CreateFieldDefinitionsDto {
  @ApiProperty({
    description:
      "Fields to add, in display order. Their display orders continue after the template model's current last field; any display_order sent here is ignored.",
    type: [CreateFieldDefinitionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateFieldDefinitionDto)
  fields!: CreateFieldDefinitionDto[];
}
```

- [ ] **Step 5: Add `addFields` to the service**

In `template-model.service.ts`, import `CreateFieldDefinitionsDto` next to `CreateFieldDefinitionDto`, then add this method after `addField`:

```ts
  async addFields(
    templateModelId: string,
    dto: CreateFieldDefinitionsDto,
    actorId?: string,
  ): Promise<FieldDefinition[]> {
    this.logger.debug(
      `Adding ${dto.fields.length} fields to template model: ${templateModelId}`,
    );
    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }

    const existing = new Set(templateModel.field_schema.map((f) => f.field_key));
    const seen = new Set<string>();
    const conflicts = new Set<string>();
    for (const field of dto.fields) {
      if (existing.has(field.field_key) || seen.has(field.field_key)) {
        conflicts.add(field.field_key);
      }
      seen.add(field.field_key);
    }
    if (conflicts.size > 0) {
      throw new ConflictException({
        message: "These field keys already exist or repeat in the request",
        field_keys: [...conflicts],
      });
    }

    const firstOrder =
      templateModel.field_schema.reduce(
        (max, field) => Math.max(max, field.display_order),
        -1,
      ) + 1;

    return this.prismaService.transaction(async (tx) => {
      const created: FieldDefinition[] = [];
      for (const [index, field] of dto.fields.entries()) {
        created.push(
          await this.templateModelDb.createFieldDefinition(
            templateModelId,
            {
              field_key: field.field_key,
              field_type: field.field_type as unknown as FieldType,
              field_format: field.field_format,
              format_spec: field.format_spec,
              description: normalizeDescription(field.description),
              display_order: firstOrder + index,
            },
            tx,
          ),
        );
      }
      await this.auditService.recordEvent(
        created.map((field) => ({
          event_type: "template_model_field_created",
          resource_type: "template_model",
          resource_id: templateModelId,
          actor_id: actorId,
          group_id: templateModel.group_id,
          payload: { field_id: field.id, field_key: field.field_key },
        })),
        tx,
      );
      return created;
    });
  }
```

- [ ] **Step 6: Add the endpoint**

In `template-model.controller.ts`:

1. Add `ApiConflictResponse` to the `@nestjs/swagger` import.
2. Add `CreateFieldDefinitionsDto` to the `./dto/field-definition.dto` import.
3. Add this endpoint directly after `addField`:

```ts
  @Post(":id/fields/bulk")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Add several fields to the template model schema in one transaction",
  })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiCreatedResponse({
    description: "The created field definitions, in request order",
    type: [FieldDefinitionResponseDto],
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiConflictResponse({
    description:
      "A field key already exists or repeats within the request; the response lists them in field_keys",
  })
  async addFields(
    @Param("id") id: string,
    @Body() dto: CreateFieldDefinitionsDto,
    @Req() req: Request,
  ) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.addFields(
      id,
      dto,
      req.resolvedIdentity.actorId,
    );
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/backend-services && npm test -- src/template-model/template-model.service.spec.ts src/template-model/template-model.controller.spec.ts`
Expected: PASS, including the 5 new tests.

- [ ] **Step 8: Commit**

```bash
git add apps/backend-services/src/template-model/dto/field-definition.dto.ts \
  apps/backend-services/src/template-model/template-model.service.ts \
  apps/backend-services/src/template-model/template-model.controller.ts \
  apps/backend-services/src/template-model/template-model.service.spec.ts \
  apps/backend-services/src/template-model/template-model.controller.spec.ts
git commit -m "feat(template-model): add several fields in one transaction

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Tagged text renderer

**Files:**
- Create: `apps/backend-services/src/testUtils/synthetic-layout.ts`
- Create: `apps/backend-services/src/template-model/label-suggestions/tagged-text.ts`
- Test: `apps/backend-services/src/template-model/label-suggestions/tagged-text.spec.ts`

**Interfaces:**
- Produces, from `tagged-text.ts`:
  - `MAX_SUGGESTION_PAGES = 30` and `MAX_TAGGED_TEXT_CHARS = 120_000`.
  - `interface ElementInfo { id; kind: "word" | "selectionMark"; pageNumber; content; polygon; offset }`.
  - `type TagTarget`, one of:
    - `{ kind: "line"; pageNumber; wordIds }`
    - `{ kind: "cell"; pageNumber; wordIds; selectionMarkIds }`
    - `{ kind: "selectionMark"; pageNumber; id; state }`
  - `interface TaggedText { text; tags: Map<string, TagTarget>; elements: Map<string, ElementInfo>; pageCount }`.
  - `class TaggedTextLimitError extends Error`.
  - `renderTaggedText(result: AnalysisResult): TaggedText`.
- Produces, from `synthetic-layout.ts`:
  - `FIXTURES_DIR` and `loadFixtureAnalyzeResult(): AnalysisResult` (the 74-field fixture form).
  - `syntheticLayoutResult(): AnalysisResult`: a line `Name Jane Doe` with words `p1-w0..2`, a ticked checkbox `p1-sm0`, and a line `Yes` with word `p1-w3`.

- [ ] **Step 1: Create the shared test fixtures helper**

Create `apps/backend-services/src/testUtils/synthetic-layout.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { AnalysisResponse, AnalysisResult } from "@/ocr/azure-types";

/** The backend's shared OCR and label fixtures (one filled 74-field form). */
export const FIXTURES_DIR = path.join(__dirname, "../../test/fixtures");

/** Layout result of the fixture form in test/fixtures/ocr_output.json. */
export function loadFixtureAnalyzeResult(): AnalysisResult {
  const raw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "ocr_output.json"), "utf-8"),
  ) as { labeling_document: { ocr_result: AnalysisResponse } };
  const result = raw.labeling_document.ocr_result.analyzeResult;
  if (!result) {
    throw new Error("ocr_output.json has no analyzeResult");
  }
  return result;
}

/**
 * A one-page layout result small enough to assert exact output against: the
 * line "Name Jane Doe", a ticked checkbox, then the line "Yes".
 * Content offsets: Name 0-4, Jane 5-9, Doe 10-13, ":selected:" 14-24, Yes 25-28.
 */
export function syntheticLayoutResult(): AnalysisResult {
  const content = "Name Jane Doe\n:selected: Yes";
  return {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-layout",
    stringIndexType: "textElements",
    content,
    contentFormat: "text",
    pages: [
      {
        pageNumber: 1,
        angle: 0,
        width: 8.5,
        height: 11,
        unit: "inch",
        spans: [{ offset: 0, length: content.length }],
        words: [
          {
            content: "Name",
            polygon: [0, 0, 1, 0, 1, 1, 0, 1],
            confidence: 1,
            span: { offset: 0, length: 4 },
          },
          {
            content: "Jane",
            polygon: [2, 0, 3, 0, 3, 1, 2, 1],
            confidence: 1,
            span: { offset: 5, length: 4 },
          },
          {
            content: "Doe",
            polygon: [4, 0, 5, 0, 5, 1, 4, 1],
            confidence: 1,
            span: { offset: 10, length: 3 },
          },
          {
            content: "Yes",
            polygon: [2, 2, 3, 2, 3, 3, 2, 3],
            confidence: 1,
            span: { offset: 25, length: 3 },
          },
        ],
        selectionMarks: [
          {
            state: "selected",
            polygon: [0, 2, 1, 2, 1, 3, 0, 3],
            confidence: 1,
            span: { offset: 14, length: 10 },
          },
        ],
        lines: [
          {
            content: "Name Jane Doe",
            polygon: [0, 0, 5, 0, 5, 1, 0, 1],
            spans: [{ offset: 0, length: 13 }],
          },
          {
            content: "Yes",
            polygon: [2, 2, 3, 2, 3, 3, 2, 3],
            spans: [{ offset: 25, length: 3 }],
          },
        ],
      },
    ],
    tables: [],
    paragraphs: [],
    styles: [],
    sections: [],
    figures: [],
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/backend-services/src/template-model/label-suggestions/tagged-text.spec.ts`:

```ts
import {
  loadFixtureAnalyzeResult,
  syntheticLayoutResult,
} from "@/testUtils/synthetic-layout";
import {
  MAX_SUGGESTION_PAGES,
  MAX_TAGGED_TEXT_CHARS,
  renderTaggedText,
  TaggedTextLimitError,
} from "./tagged-text";

describe("renderTaggedText", () => {
  it("puts tags at the exact positions", () => {
    const tagged = renderTaggedText(syntheticLayoutResult());

    expect(tagged.text).toBe(
      "--- page 1 ---\n[L1] Name Jane Doe\n[S1 ☒] [L2] Yes",
    );
    expect(tagged.tags.get("L1")).toEqual({
      kind: "line",
      pageNumber: 1,
      wordIds: ["p1-w0", "p1-w1", "p1-w2"],
    });
    expect(tagged.tags.get("S1")).toEqual({
      kind: "selectionMark",
      pageNumber: 1,
      id: "p1-sm0",
      state: "selected",
    });
    expect(tagged.elements.get("p1-w3")?.content).toBe("Yes");
    expect(tagged.pageCount).toBe(1);
  });

  it("tags every checkbox of the fixture form in reading order", () => {
    const tagged = renderTaggedText(loadFixtureAnalyzeResult());
    const checkboxTags = [...tagged.tags.entries()].filter(
      ([, target]) => target.kind === "selectionMark",
    );

    expect(checkboxTags).toHaveLength(28);
    expect(tagged.text).not.toMatch(/:(un)?selected:/);
    const positions = checkboxTags.map(([tag]) =>
      tagged.text.indexOf(`[${tag} `),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("makes every fixture word reachable through a line or table-cell tag", () => {
    const tagged = renderTaggedText(loadFixtureAnalyzeResult());
    const reachable = new Set<string>();
    for (const target of tagged.tags.values()) {
      if (target.kind !== "selectionMark") {
        for (const id of target.wordIds) reachable.add(id);
      }
    }
    const wordIds = [...tagged.elements.values()]
      .filter((element) => element.kind === "word")
      .map((element) => element.id);

    expect(wordIds.length).toBeGreaterThan(400);
    expect(wordIds.filter((id) => !reachable.has(id))).toEqual([]);
  });

  it("tags the fixture's table cells and starts with a page marker", () => {
    const tagged = renderTaggedText(loadFixtureAnalyzeResult());
    const cellTags = [...tagged.tags.keys()].filter((tag) =>
      /^T\d+ r\d+ c\d+$/.test(tag),
    );

    expect(cellTags.length).toBeGreaterThan(0);
    expect(tagged.text).toContain(`[${cellTags[0]}] `);
    expect(tagged.text.startsWith("--- page 1 ---\n")).toBe(true);
  });

  it("refuses documents with too many pages", () => {
    const base = syntheticLayoutResult();
    const pages = Array.from({ length: MAX_SUGGESTION_PAGES + 1 }, (_, i) => ({
      ...base.pages[0],
      pageNumber: i + 1,
    }));

    expect(() => renderTaggedText({ ...base, pages })).toThrow(
      TaggedTextLimitError,
    );
  });

  it("refuses documents whose tagged text is too long", () => {
    const base = syntheticLayoutResult();
    const content = "x".repeat(MAX_TAGGED_TEXT_CHARS + 1);

    expect(() =>
      renderTaggedText({
        ...base,
        content,
        pages: [
          {
            ...base.pages[0],
            words: [],
            selectionMarks: [],
            lines: [],
            spans: [{ offset: 0, length: content.length }],
          },
        ],
      }),
    ).toThrow(TaggedTextLimitError);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/tagged-text.spec.ts`
Expected: FAIL with `Cannot find module './tagged-text'`.

- [ ] **Step 4: Implement the renderer**

Create `apps/backend-services/src/template-model/label-suggestions/tagged-text.ts`:

```ts
import type { AnalysisResult, Span } from "@/ocr/azure-types";

/** Documents with more pages than this are refused for label suggestions. */
export const MAX_SUGGESTION_PAGES = 30;

/** Tagged text longer than this is refused, so one LLM call stays a sensible size. */
export const MAX_TAGGED_TEXT_CHARS = 120_000;

/** One OCR element the labelling screen can assign to a field. */
export interface ElementInfo {
  /** `p{page}-w{index}` or `p{page}-sm{index}`, the ids the labelling screen uses. */
  id: string;
  kind: "word" | "selectionMark";
  pageNumber: number;
  /** Word text, or "selected" / "unselected" for a checkbox. */
  content: string;
  polygon: number[];
  /** Offset of the element's span in `analyzeResult.content`. */
  offset: number;
}

/** What one tag in the tagged text points at. */
export type TagTarget =
  | { kind: "line"; pageNumber: number; wordIds: string[] }
  | {
      kind: "cell";
      pageNumber: number;
      wordIds: string[];
      selectionMarkIds: string[];
    }
  | {
      kind: "selectionMark";
      pageNumber: number;
      id: string;
      state: "selected" | "unselected";
    };

/**
 * The document text an LLM reads, with a tag at the start of every line and
 * table cell and in place of every checkbox, plus the lookups that turn a tag
 * back into OCR element ids.
 */
export interface TaggedText {
  text: string;
  /** Tag without brackets ("L12", "T2 r3 c1", "S4") to what it points at. */
  tags: Map<string, TagTarget>;
  /** Element id to the element. */
  elements: Map<string, ElementInfo>;
  pageCount: number;
}

/** Thrown when a document is too large for one suggestion call. */
export class TaggedTextLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaggedTextLimitError";
  }
}

interface Insertion {
  offset: number;
  rank: number;
  text: string;
}

interface Replacement {
  offset: number;
  length: number;
  text: string;
}

interface MarkInfo {
  info: ElementInfo;
  length: number;
}

/** When several insertions share an offset: page marker, then cell tag, then line tag. */
const INSERT_RANK = { page: 0, cell: 1, line: 2 } as const;

function inSpans(offset: number, spans: Span[]): boolean {
  return spans.some(
    (span) => offset >= span.offset && offset < span.offset + span.length,
  );
}

function firstOffset(spans: Span[]): number {
  return Math.min(...spans.map((span) => span.offset));
}

/**
 * Renders a prebuilt-layout result as tagged text. Words map to lines and
 * cells by span containment. A line whose words all sit in table cells gets
 * no tag of its own; its words are reached through the cell tags.
 */
export function renderTaggedText(result: AnalysisResult): TaggedText {
  const pages = [...(result.pages ?? [])].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );
  if (pages.length > MAX_SUGGESTION_PAGES) {
    throw new TaggedTextLimitError(
      `The document has ${pages.length} pages; label suggestions support at most ${MAX_SUGGESTION_PAGES}.`,
    );
  }
  const content = result.content ?? "";

  const elements = new Map<string, ElementInfo>();
  const words: ElementInfo[] = [];
  const marks: MarkInfo[] = [];
  for (const page of pages) {
    (page.words ?? []).forEach((word, index) => {
      if (!word.polygon || word.polygon.length < 8) return;
      const info: ElementInfo = {
        id: `p${page.pageNumber}-w${index}`,
        kind: "word",
        pageNumber: page.pageNumber,
        content: word.content,
        polygon: word.polygon,
        offset: word.span.offset,
      };
      words.push(info);
      elements.set(info.id, info);
    });
    (page.selectionMarks ?? []).forEach((mark, index) => {
      if (!mark.polygon || mark.polygon.length < 8) return;
      const info: ElementInfo = {
        id: `p${page.pageNumber}-sm${index}`,
        kind: "selectionMark",
        pageNumber: page.pageNumber,
        content: mark.state === "selected" ? "selected" : "unselected",
        polygon: mark.polygon,
        offset: mark.span.offset,
      };
      marks.push({ info, length: mark.span.length });
      elements.set(info.id, info);
    });
  }

  const tags = new Map<string, TagTarget>();
  const inserts: Insertion[] = [];
  const replacements: Replacement[] = [];

  for (const page of pages) {
    if ((page.spans ?? []).length === 0) continue;
    inserts.push({
      offset: firstOffset(page.spans),
      rank: INSERT_RANK.page,
      text: `--- page ${page.pageNumber} ---\n`,
    });
  }

  const wordsInCells = new Set<string>();
  (result.tables ?? []).forEach((table, tableIndex) => {
    for (const cell of table.cells ?? []) {
      const spans = cell.spans ?? [];
      if (spans.length === 0) continue;
      const wordIds = words
        .filter((word) => inSpans(word.offset, spans))
        .map((word) => word.id);
      const selectionMarkIds = marks
        .filter((mark) => inSpans(mark.info.offset, spans))
        .map((mark) => mark.info.id);
      const tag = `T${tableIndex + 1} r${cell.rowIndex} c${cell.columnIndex}`;
      tags.set(tag, {
        kind: "cell",
        pageNumber: cell.boundingRegions?.[0]?.pageNumber ?? 1,
        wordIds,
        selectionMarkIds,
      });
      for (const id of wordIds) wordsInCells.add(id);
      inserts.push({
        offset: firstOffset(spans),
        rank: INSERT_RANK.cell,
        text: `[${tag}] `,
      });
    }
  });

  const lines = pages
    .flatMap((page) =>
      (page.lines ?? [])
        .filter((line) => (line.spans ?? []).length > 0)
        .map((line) => ({
          pageNumber: page.pageNumber,
          spans: line.spans,
          start: firstOffset(line.spans),
        })),
    )
    .sort((a, b) => a.start - b.start);
  let lineNumber = 0;
  for (const line of lines) {
    const wordIds = words
      .filter((word) => inSpans(word.offset, line.spans))
      .map((word) => word.id);
    if (wordIds.length === 0 || wordIds.every((id) => wordsInCells.has(id))) {
      continue;
    }
    lineNumber += 1;
    const tag = `L${lineNumber}`;
    tags.set(tag, { kind: "line", pageNumber: line.pageNumber, wordIds });
    inserts.push({
      offset: line.start,
      rank: INSERT_RANK.line,
      text: `[${tag}] `,
    });
  }

  [...marks]
    .sort((a, b) => a.info.offset - b.info.offset)
    .forEach((mark, index) => {
      const tag = `S${index + 1}`;
      const state = mark.info.content === "selected" ? "selected" : "unselected";
      tags.set(tag, {
        kind: "selectionMark",
        pageNumber: mark.info.pageNumber,
        id: mark.info.id,
        state,
      });
      replacements.push({
        offset: mark.info.offset,
        length: Math.max(1, mark.length),
        text: `[${tag} ${state === "selected" ? "☒" : "☐"}]`,
      });
    });

  const text = compose(content, inserts, replacements);
  if (text.length > MAX_TAGGED_TEXT_CHARS) {
    throw new TaggedTextLimitError(
      `The document's tagged text is ${text.length} characters; label suggestions support at most ${MAX_TAGGED_TEXT_CHARS}.`,
    );
  }
  return { text, tags, elements, pageCount: pages.length };
}

/**
 * Copies `content` in order, adding each insertion at its offset and
 * swapping each replaced range for its replacement text.
 */
function compose(
  content: string,
  inserts: Insertion[],
  replacements: Replacement[],
): string {
  const orderedInserts = [...inserts].sort(
    (a, b) => a.offset - b.offset || a.rank - b.rank,
  );
  const orderedReplacements = [...replacements].sort(
    (a, b) => a.offset - b.offset,
  );
  const parts: string[] = [];
  let cursor = 0;
  let insertIndex = 0;
  let replaceIndex = 0;
  while (cursor < content.length || insertIndex < orderedInserts.length) {
    while (
      insertIndex < orderedInserts.length &&
      orderedInserts[insertIndex].offset <= cursor
    ) {
      parts.push(orderedInserts[insertIndex].text);
      insertIndex += 1;
    }
    while (
      replaceIndex < orderedReplacements.length &&
      orderedReplacements[replaceIndex].offset < cursor
    ) {
      replaceIndex += 1;
    }
    if (cursor >= content.length) break;
    const replacement = orderedReplacements[replaceIndex];
    if (replacement && replacement.offset === cursor) {
      parts.push(replacement.text);
      cursor += replacement.length;
      replaceIndex += 1;
      continue;
    }
    const nextInsert =
      insertIndex < orderedInserts.length
        ? orderedInserts[insertIndex].offset
        : content.length;
    const nextReplace = replacement ? replacement.offset : content.length;
    const next = Math.min(nextInsert, nextReplace, content.length);
    parts.push(content.slice(cursor, next));
    cursor = next;
  }
  return parts.join("");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/tagged-text.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/src/testUtils/synthetic-layout.ts \
  apps/backend-services/src/template-model/label-suggestions/tagged-text.ts \
  apps/backend-services/src/template-model/label-suggestions/tagged-text.spec.ts
git commit -m "feat(label-suggestions): render stored OCR as tagged text

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Reference resolver

**Files:**
- Create: `apps/backend-services/src/template-model/label-suggestions/resolve-refs.ts`
- Test: `apps/backend-services/src/template-model/label-suggestions/resolve-refs.spec.ts`

**Interfaces:**
- Consumes: `TaggedText`, `ElementInfo` and `renderTaggedText` (Task 3), and `FIXTURES_DIR`, `loadFixtureAnalyzeResult` and `syntheticLayoutResult` (Task 3).
- Produces:
  - `interface SuggestedRef { tag: string; text: string }`.
  - `interface ResolvedRefs { elementIds: string[]; value: string; pageNumber: number; polygon: number[] }`.
  - `normalizeForMatch(value: string): string`.
  - `resolveRefs(refs: SuggestedRef[], tagged: TaggedText, expectSelectionMark: boolean, claimed: ReadonlySet<string>): ResolvedRefs | null`.

The spec says to "take the first run". This plan refines that to "the first run not already used by an earlier field". Callers resolve fields in reply order and pass the ids already used as `claimed`, so two fields with the same text on one line (two signature dates, say) land on different words instead of both on the first.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend-services/src/template-model/label-suggestions/resolve-refs.spec.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import {
  FIXTURES_DIR,
  loadFixtureAnalyzeResult,
  syntheticLayoutResult,
} from "@/testUtils/synthetic-layout";
import {
  normalizeForMatch,
  resolveRefs,
  type SuggestedRef,
} from "./resolve-refs";
import {
  type ElementInfo,
  renderTaggedText,
  type TaggedText,
} from "./tagged-text";

const none: ReadonlySet<string> = new Set<string>();

/** A tagged text with one line "L1" whose words are given, for edge cases. */
function oneLine(words: string[]): TaggedText {
  const elements = new Map(
    words.map((content, index) => [
      `p1-w${index}`,
      {
        id: `p1-w${index}`,
        kind: "word" as const,
        pageNumber: 1,
        content,
        polygon: [index, 0, index + 1, 0, index + 1, 1, index, 1],
        offset: index * 10,
      },
    ]),
  );
  return {
    text: `[L1] ${words.join(" ")}`,
    tags: new Map([
      [
        "L1",
        {
          kind: "line" as const,
          pageNumber: 1,
          wordIds: words.map((_, index) => `p1-w${index}`),
        },
      ],
    ]),
    elements,
    pageCount: 1,
  };
}

describe("normalizeForMatch", () => {
  it("folds case, width and spacing", () => {
    expect(normalizeForMatch("  Jane\t DOE ")).toBe("jane doe");
    expect(normalizeForMatch("ＡＢＣ")).toBe("abc");
  });
});

describe("resolveRefs", () => {
  const tagged = renderTaggedText(syntheticLayoutResult());

  it("resolves a value inside a line", () => {
    expect(
      resolveRefs([{ tag: "L1", text: "Jane Doe" }], tagged, false, none),
    ).toEqual({
      elementIds: ["p1-w1", "p1-w2"],
      value: "Jane Doe",
      pageNumber: 1,
      polygon: [2, 0, 5, 0, 5, 1, 2, 1],
    });
  });

  it("matches regardless of case and spacing", () => {
    expect(
      resolveRefs([{ tag: " L1 ", text: "  jane   DOE " }], tagged, false, none)
        ?.elementIds,
    ).toEqual(["p1-w1", "p1-w2"]);
  });

  it("falls back to the shortest run containing a value glued to its caption", () => {
    const glued = oneLine(["Date:2026-03-14", "signed"]);
    expect(
      resolveRefs([{ tag: "L1", text: "2026-03-14" }], glued, false, none),
    ).toEqual(expect.objectContaining({ elementIds: ["p1-w0"] }));
  });

  it("skips words already claimed by an earlier field", () => {
    const twice = oneLine(["2026-01-15", "and", "2026-01-15"]);
    expect(
      resolveRefs(
        [{ tag: "L1", text: "2026-01-15" }],
        twice,
        false,
        new Set(["p1-w0"]),
      )?.elementIds,
    ).toEqual(["p1-w2"]);
  });

  it("joins several refs in order", () => {
    const result = resolveRefs(
      [
        { tag: "L1", text: "Jane" },
        { tag: "L2", text: "Yes" },
      ],
      tagged,
      false,
      none,
    );
    expect(result?.elementIds).toEqual(["p1-w1", "p1-w3"]);
    expect(result?.value).toBe("Jane Yes");
  });

  it("resolves a checkbox tag for a checkbox field", () => {
    expect(
      resolveRefs([{ tag: "S1", text: "" }], tagged, true, none),
    ).toEqual({
      elementIds: ["p1-sm0"],
      value: "selected",
      pageNumber: 1,
      polygon: [0, 2, 1, 2, 1, 3, 0, 3],
    });
  });

  it.each<[string, SuggestedRef[], boolean]>([
    ["an unknown tag", [{ tag: "L9", text: "Jane" }], false],
    ["text that is not on the tag", [{ tag: "L1", text: "John" }], false],
    ["empty text on a line", [{ tag: "L1", text: "  " }], false],
    ["a checkbox tag on a text field", [{ tag: "S1", text: "" }], false],
    ["a line tag on a checkbox field", [{ tag: "L1", text: "Jane" }], true],
    ["no refs", [], false],
  ])("drops the field for %s", (_, refs, expectSelectionMark) => {
    expect(resolveRefs(refs, tagged, expectSelectionMark, none)).toBeNull();
  });

  it("reproduces every reference label of the fixture form from ideal replies", () => {
    const result = loadFixtureAnalyzeResult();
    const fixtureTagged = renderTaggedText(result);
    const page = result.pages[0];
    const labels = (
      JSON.parse(
        fs.readFileSync(
          path.join(FIXTURES_DIR, "form_image_0.jpg.labels.json"),
          "utf-8",
        ),
      ) as {
        labels: Array<{
          label: string;
          value: Array<{ text: string; boundingBoxes: number[][] }>;
        }>;
      }
    ).labels;
    const elements = [...fixtureTagged.elements.values()];
    const failures: string[] = [];
    const cases: Array<{
      name: string;
      isCheckbox: boolean;
      expected: ElementInfo[];
    }> = [];

    for (const label of labels) {
      const isCheckbox = label.value.every(
        (v) => v.text === ":selected:" || v.text === ":unselected:",
      );
      const found = label.value.map((v) => {
        const point = centre(
          v.boundingBoxes[0].map(
            (n, i) => n * (i % 2 === 0 ? page.width : page.height),
          ),
        );
        return elements.find(
          (e) =>
            e.kind === (isCheckbox ? "selectionMark" : "word") &&
            contains(e.polygon, point),
        );
      });
      const expected = found.filter(
        (e): e is ElementInfo => e !== undefined,
      );
      if (expected.length !== found.length) {
        failures.push(`${label.label}: a reference box matched no OCR element`);
        continue;
      }
      expected.sort((a, b) => a.offset - b.offset);
      cases.push({ name: label.label, isCheckbox, expected });
    }

    // Resolve in the order the values appear on the page, which is the order
    // the prompt asks the LLM to list fields in.
    cases.sort((a, b) => a.expected[0].offset - b.expected[0].offset);
    const claimed = new Set<string>();
    for (const { name, isCheckbox, expected } of cases) {
      const expectedIds = expected.map((e) => e.id);
      const resolved = resolveRefs(
        idealRefs(fixtureTagged, expectedIds, isCheckbox),
        fixtureTagged,
        isCheckbox,
        claimed,
      );
      if (resolved === null) {
        failures.push(`${name}: dropped`);
        continue;
      }
      for (const id of resolved.elementIds) claimed.add(id);
      if (resolved.elementIds.join(",") !== expectedIds.join(",")) {
        failures.push(
          `${name}: got ${resolved.elementIds.join(",")}, expected ${expectedIds.join(",")}`,
        );
      }
    }

    expect(labels).toHaveLength(74);
    expect(failures).toEqual([]);
  });
});

function centre(polygon: number[]): [number, number] {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function contains(polygon: number[], [x, y]: [number, number]): boolean {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return (
    x >= Math.min(...xs) &&
    x <= Math.max(...xs) &&
    y >= Math.min(...ys) &&
    y <= Math.max(...ys)
  );
}

/** The refs a perfect LLM would return: a cell tag when the word is in a cell, else its line tag. */
function idealRefs(
  tagged: TaggedText,
  ids: string[],
  isCheckbox: boolean,
): SuggestedRef[] {
  if (isCheckbox) {
    const tag = [...tagged.tags.entries()].find(
      ([, target]) => target.kind === "selectionMark" && target.id === ids[0],
    )?.[0];
    return tag ? [{ tag, text: "" }] : [];
  }
  const refs: SuggestedRef[] = [];
  for (const id of ids) {
    let tag: string | undefined;
    for (const [candidate, target] of tagged.tags) {
      if (target.kind === "cell" && target.wordIds.includes(id)) {
        tag = candidate;
        break;
      }
      if (target.kind === "line" && target.wordIds.includes(id) && !tag) {
        tag = candidate;
      }
    }
    if (!tag) throw new Error(`no tag holds ${id}`);
    const word = tagged.elements.get(id)?.content ?? "";
    const last = refs[refs.length - 1];
    if (last && last.tag === tag) {
      last.text = `${last.text} ${word}`;
    } else {
      refs.push({ tag, text: word });
    }
  }
  return refs;
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/resolve-refs.spec.ts`
Expected: FAIL with `Cannot find module './resolve-refs'`.

- [ ] **Step 3: Implement the resolver**

Create `apps/backend-services/src/template-model/label-suggestions/resolve-refs.ts`:

```ts
import type { ElementInfo, TaggedText } from "./tagged-text";

/** One pointer from an LLM reply: a tag, and the value's exact text after it. */
export interface SuggestedRef {
  tag: string;
  text: string;
}

export interface ResolvedRefs {
  elementIds: string[];
  value: string;
  pageNumber: number;
  /** Union rectangle of the elements, in the OCR page's units. */
  polygon: number[];
}

interface CandidateWord {
  id: string;
  norm: string;
  element: ElementInfo;
}

/** Case-, width- and spacing-insensitive form used to compare reply text with OCR words. */
export function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Turns an LLM's refs for one field into OCR element ids. Returns null, and
 * the field is dropped rather than guessed, when any ref names an unknown tag,
 * its text is not on that tag, or the ref kind does not fit the field.
 * Ids in `claimed` belong to fields resolved earlier and are skipped.
 */
export function resolveRefs(
  refs: SuggestedRef[],
  tagged: TaggedText,
  expectSelectionMark: boolean,
  claimed: ReadonlySet<string>,
): ResolvedRefs | null {
  if (refs.length === 0) return null;

  if (expectSelectionMark) {
    if (refs.length !== 1) return null;
    const target = tagged.tags.get(refs[0].tag.trim());
    if (!target || target.kind !== "selectionMark" || claimed.has(target.id)) {
      return null;
    }
    const element = tagged.elements.get(target.id);
    if (!element) return null;
    return {
      elementIds: [target.id],
      value: target.state,
      pageNumber: target.pageNumber,
      polygon: element.polygon,
    };
  }

  const picked: ElementInfo[] = [];
  const values: string[] = [];
  const taken = new Set(claimed);
  for (const ref of refs) {
    const target = tagged.tags.get(ref.tag.trim());
    if (!target || target.kind === "selectionMark") return null;
    const wanted = normalizeForMatch(ref.text);
    if (wanted.length === 0) return null;
    const candidates: CandidateWord[] = target.wordIds.flatMap((id) => {
      const element = tagged.elements.get(id);
      return element
        ? [{ id, norm: normalizeForMatch(element.content), element }]
        : [];
    });
    const run = findRun(candidates, wanted, taken);
    if (!run) return null;
    const words = candidates.slice(run[0], run[1] + 1);
    for (const word of words) {
      picked.push(word.element);
      taken.add(word.id);
    }
    values.push(words.map((word) => word.element.content).join(" "));
  }

  return {
    elementIds: picked.map((element) => element.id),
    value: values.join(" "),
    pageNumber: picked[0].pageNumber,
    polygon: unionRect(picked.map((element) => element.polygon)),
  };
}

/**
 * The first free run of words whose joined text equals `target`; failing
 * that, the shortest free run whose joined text contains it.
 */
function findRun(
  words: CandidateWord[],
  target: string,
  taken: ReadonlySet<string>,
): [number, number] | null {
  const free = (start: number, end: number): boolean =>
    words.slice(start, end + 1).every((word) => !taken.has(word.id));

  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    for (let end = start; end < words.length; end += 1) {
      joined = end === start ? words[end].norm : `${joined} ${words[end].norm}`;
      if (joined.length > target.length) break;
      if (joined === target && free(start, end)) return [start, end];
    }
  }

  let best: [number, number] | null = null;
  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    for (let end = start; end < words.length; end += 1) {
      joined = end === start ? words[end].norm : `${joined} ${words[end].norm}`;
      if (joined.includes(target)) {
        if (free(start, end) && (best === null || end - start < best[1] - best[0])) {
          best = [start, end];
        }
        break;
      }
    }
  }
  return best;
}

function unionRect(polygons: number[][]): number[] {
  const xs = polygons.flatMap((polygon) => polygon.filter((_, i) => i % 2 === 0));
  const ys = polygons.flatMap((polygon) => polygon.filter((_, i) => i % 2 === 1));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/resolve-refs.spec.ts`
Expected: PASS (14 tests, including the fixture round trip over all 74 labels).

If the round trip lists failures, read each message: `got …, expected …` means the resolver chose different words, and `dropped` means it found none. Fix the resolver, not the test. The test encodes the contract that a perfect reply reproduces the reference labels.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/template-model/label-suggestions/resolve-refs.ts \
  apps/backend-services/src/template-model/label-suggestions/resolve-refs.spec.ts
git commit -m "feat(label-suggestions): resolve LLM tag references to OCR element ids

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: LLM access

**Files:**
- Create: `apps/backend-services/src/template-model/label-suggestions/suggestion-llm.ts`
- Test: `apps/backend-services/src/template-model/label-suggestions/suggestion-llm.spec.ts`

**Interfaces:**
- Produces:
  - `LLM_TIMEOUT_MS = 120_000`.
  - `interface StructuredLlmRequest<T> { system: string; prompt: string; schema: z.ZodType<T>; schemaName: string }`, where `z` is from `zod/v4`.
  - `@Injectable() class SuggestionLlmService { constructor(config: ConfigService, logger: AppLoggerService); generate<T>(request): Promise<T>; protected buildModel(): LanguageModel }`.
  - `describeLlmError(error: unknown): string`.
- Errors: missing settings → `ServiceUnavailableException({ message, missingSettings })`. Any model failure → `HttpException({ message, reason }, 502)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend-services/src/template-model/label-suggestions/suggestion-llm.spec.ts`:

```ts
import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod/v4";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { SuggestionLlmService } from "./suggestion-llm";

const SETTINGS: Record<string, string> = {
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_API_KEY: "test-key",
  AZURE_OPENAI_DEPLOYMENT: "gpt-test",
};

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

/** Uses the real settings check, then swaps in a mock model. */
class MockedLlmService extends SuggestionLlmService {
  constructor(
    config: ConfigService,
    private readonly mockModel: LanguageModel,
  ) {
    super(config, mockAppLogger);
  }

  protected override buildModel(): LanguageModel {
    super.buildModel();
    return this.mockModel;
  }
}

class ExposedLlmService extends SuggestionLlmService {
  exposeModel(): LanguageModel {
    return this.buildModel();
  }
}

function modelReplying(
  text: string,
  finish: "stop" | "length" = "stop",
): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: finish, raw: undefined },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

const request = {
  system: "system text",
  prompt: "prompt text",
  schema: z.object({ answer: z.string() }),
  schemaName: "test_reply",
};

describe("SuggestionLlmService", () => {
  it("returns the parsed reply", async () => {
    const service = new MockedLlmService(
      configWith(SETTINGS),
      modelReplying('{"answer":"42"}'),
    );
    await expect(service.generate(request)).resolves.toEqual({ answer: "42" });
  });

  it("names the missing settings, never their values, with a 503", async () => {
    const service = new SuggestionLlmService(
      configWith({ AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com" }),
      mockAppLogger,
    );
    const error = await service.generate(request).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      message: "Label suggestions are not configured",
      missingSettings: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"],
    });
  });

  it("turns a reply that breaks the schema into a 502", async () => {
    const service = new MockedLlmService(
      configWith(SETTINGS),
      modelReplying('{"wrong":1}'),
    );
    const error = await service.generate(request).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(502);
    expect((error as HttpException).getResponse()).toEqual({
      message: "The suggestion model call failed",
      reason: "the reply did not match the expected format",
    });
  });

  it("turns a reply that was cut off into a 502", async () => {
    const service = new MockedLlmService(
      configWith(SETTINGS),
      modelReplying('{"answer":"4', "length"),
    );
    const error = await service.generate(request).catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(502);
    expect((error as HttpException).getResponse()).toEqual(
      expect.objectContaining({
        reason: "the reply was cut off before it finished",
      }),
    );
  });

  it("builds an Azure chat-completions model for the configured deployment", () => {
    const service = new ExposedLlmService(configWith(SETTINGS), mockAppLogger);
    expect(service.exposeModel()).toMatchObject({
      provider: "azure.chat",
      modelId: "gpt-test",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/suggestion-llm.spec.ts`
Expected: FAIL with `Cannot find module './suggestion-llm'`.

- [ ] **Step 3: Implement the service**

Create `apps/backend-services/src/template-model/label-suggestions/suggestion-llm.ts`:

```ts
import { createAzure } from "@ai-sdk/azure";
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  APICallError,
  generateText,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
} from "ai";
import type { z } from "zod/v4";
import { AppLoggerService } from "@/logging/app-logger.service";

/** How long one suggestion call may take before it is abandoned. */
export const LLM_TIMEOUT_MS = 120_000;

const DEFAULT_API_VERSION = "2024-10-21";

export interface StructuredLlmRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Name sent with the JSON schema; letters, digits, _ and - only. */
  schemaName: string;
}

/**
 * Calls the Azure OpenAI deployment named by the AZURE_OPENAI_* settings (the
 * same settings the workflow agent reads) with a strict reply schema.
 */
@Injectable()
export class SuggestionLlmService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async generate<T>(request: StructuredLlmRequest<T>): Promise<T> {
    const model = this.buildModel();
    try {
      const result = await generateText({
        model,
        system: request.system,
        prompt: request.prompt,
        output: Output.object({
          schema: request.schema,
          name: request.schemaName,
        }),
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });
      return result.output;
    } catch (error) {
      const reason = describeLlmError(error);
      this.logger.warn("Label suggestion model call failed", { reason });
      throw new HttpException(
        { message: "The suggestion model call failed", reason },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  protected buildModel(): LanguageModel {
    const endpoint = this.read("AZURE_OPENAI_ENDPOINT");
    const apiKey = this.read("AZURE_OPENAI_API_KEY");
    const deployment = this.read("AZURE_OPENAI_DEPLOYMENT");
    if (endpoint === null || apiKey === null || deployment === null) {
      const missingSettings = [
        endpoint === null ? "AZURE_OPENAI_ENDPOINT" : null,
        apiKey === null ? "AZURE_OPENAI_API_KEY" : null,
        deployment === null ? "AZURE_OPENAI_DEPLOYMENT" : null,
      ].filter((name): name is string => name !== null);
      throw new ServiceUnavailableException({
        message: "Label suggestions are not configured",
        missingSettings,
      });
    }
    const trimmed = endpoint.replace(/\/+$/, "");
    const baseURL = /\/openai$/i.test(trimmed) ? trimmed : `${trimmed}/openai`;
    const azure = createAzure({
      apiKey,
      baseURL,
      useDeploymentBasedUrls: true,
      apiVersion: this.read("AZURE_OPENAI_API_VERSION") ?? DEFAULT_API_VERSION,
    });
    return azure.chat(deployment);
  }

  private read(key: string): string | null {
    const raw = this.config.get<string>(key);
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

/** A short reason for a failed model call that never includes the reply or the document. */
export function describeLlmError(error: unknown): string {
  if (NoObjectGeneratedError.isInstance(error)) {
    return "the reply did not match the expected format";
  }
  if (NoOutputGeneratedError.isInstance(error)) {
    return "the reply was cut off before it finished";
  }
  if (RetryError.isInstance(error)) {
    return "the model endpoint kept failing after retries";
  }
  if (APICallError.isInstance(error)) {
    return `the model endpoint returned HTTP ${error.statusCode ?? "error"}`;
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return `the model did not answer within ${LLM_TIMEOUT_MS / 1000} s`;
  }
  return "an unexpected error occurred";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/suggestion-llm.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/template-model/label-suggestions/suggestion-llm.ts \
  apps/backend-services/src/template-model/label-suggestions/suggestion-llm.spec.ts
git commit -m "feat(label-suggestions): Azure OpenAI access with a strict reply schema

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Prompts and the suggestion service

**Files:**
- Create: `apps/backend-services/src/template-model/label-suggestions/prompts.ts`
- Create: `apps/backend-services/src/template-model/dto/field-suggestion.dto.ts`
- Modify: `apps/backend-services/src/template-model/dto/suggestion.dto.ts`
- Create: `apps/backend-services/src/template-model/label-suggestions/label-suggestion.service.ts`
- Test: `apps/backend-services/src/template-model/label-suggestions/label-suggestion.service.spec.ts`

**Interfaces:**
- Consumes: `renderTaggedText`, `TaggedTextLimitError` and `TaggedText` (Task 3); `resolveRefs` and `SuggestedRef` (Task 4); `SuggestionLlmService.generate` (Task 5); `TemplateModelDbService.findTemplateModel` and `findLabeledDocument` (existing); `FieldDefinition.description` (Task 1).
- Produces:
  - `SuggestFieldsDto { document_id }`.
  - `SuggestedFieldDto { field_key; field_type; description; value: string | null; page_number: number | null; already_exists }`.
  - `LabelSuggestionDto.source_type: "llm"`.
  - `LabelSuggestionService.suggestLabels(templateModelId: string, documentId: string): Promise<LabelSuggestionDto[]>`.
  - `LabelSuggestionService.suggestFields(templateModelId: string, documentId: string): Promise<SuggestedFieldDto[]>`.
  - `normalizeFieldKey(raw: string): string` and `MAX_SUGGESTED_FIELDS = 200`.

- [ ] **Step 1: Write the DTOs**

Create `apps/backend-services/src/template-model/dto/field-suggestion.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";
import { FieldType } from "./field-definition.dto";

export class SuggestFieldsDto {
  @ApiProperty({
    description:
      "Labelling document id (the id the /documents/:docId routes take) whose OCR the fields are suggested from",
  })
  @IsString()
  @IsNotEmpty()
  document_id!: string;
}

export class SuggestedFieldDto {
  @ApiProperty({
    description: "Suggested field key: lowercase snake_case, unique within the reply",
  })
  field_key!: string;

  @ApiProperty({ description: "Suggested field type", enum: FieldType })
  field_type!: FieldType;

  @ApiProperty({
    description:
      "One-line description naming the printed caption and where the value sits",
  })
  description!: string;

  @ApiProperty({
    description:
      "The value found on this document, or null when the field is blank on it",
    nullable: true,
    type: String,
  })
  value!: string | null;

  @ApiProperty({
    description: "Page the value was found on, or null when it is blank",
    nullable: true,
    type: Number,
  })
  page_number!: number | null;

  @ApiProperty({
    description: "True when the template model already has a field with this key",
  })
  already_exists!: boolean;
}
```

In `dto/suggestion.dto.ts`, replace the `source_type` property with:

```ts
  @ApiProperty({
    description: "Where the suggestion came from",
    enum: ["llm"],
  })
  @IsString()
  source_type!: "llm";
```

- [ ] **Step 2: Write the prompts**

Create `apps/backend-services/src/template-model/label-suggestions/prompts.ts`:

```ts
import { z } from "zod/v4";

export const FIELD_TYPES = [
  "string",
  "number",
  "date",
  "selectionMark",
  "signature",
] as const;

export type SuggestedFieldType = (typeof FIELD_TYPES)[number];

const refSchema = z.object({
  tag: z
    .string()
    .describe('A tag from the document text without brackets, e.g. "L12", "T2 r3 c1" or "S4"'),
  text: z
    .string()
    .describe("The value exactly as it appears after that tag; empty for a checkbox tag"),
});

export const suggestFieldsReplySchema = z.object({
  fields: z.array(
    z.object({
      key: z.string(),
      type: z.enum(FIELD_TYPES),
      description: z.string(),
      refs: z.array(refSchema),
    }),
  ),
});

export type SuggestFieldsReply = z.infer<typeof suggestFieldsReplySchema>;

export const suggestLabelsReplySchema = z.object({
  fields: z.array(
    z.object({
      key: z.string(),
      refs: z.array(refSchema),
    }),
  ),
});

export type SuggestLabelsReply = z.infer<typeof suggestLabelsReplySchema>;

const TAG_GUIDE = `The document text is the OCR of a form, with tags marking where things are:
- [L12] starts line 12.
- [T2 r3 c1] starts the cell in row 3, column 1 of table 2 (rows and columns count from 0).
- [S4 ☒] is checkbox 4, ticked; [S4 ☐] is checkbox 4, not ticked.
- "--- page N ---" starts page N.
Point at values with tags. Never retype a value that is not in the text.`;

export const SUGGEST_FIELDS_SYSTEM = `You design the list of fields to extract from a type of form.

${TAG_GUIDE}

Rules:
- Propose only values a person fills in; never headings, instructions or printed captions.
- Every checkbox is its own field of type "selectionMark", named for what ticking it means (for example "needs_assistance_yes" and "needs_assistance_no"). Point at its S tag whether or not it is ticked.
- A grid with fixed rows and columns becomes one field per fillable cell, keyed by row and column.
- Keys are lowercase snake_case, unique and meaningful.
- The description is one plain-English sentence naming the printed caption and where the value sits on the form.
- Types: "string", "number", "date", "selectionMark" or "signature".
- refs say where the value sits on this copy: one ref per line or cell the value occupies, each with the value's exact text there. Leave refs empty when the field is blank on this copy.`;

export function buildSuggestFieldsPrompt(taggedText: string): string {
  return `List the fields of this form.

<document>
${taggedText}
</document>`;
}

export interface PromptField {
  key: string;
  type: string;
  description: string | null;
}

export const SUGGEST_LABELS_SYSTEM = `You find where each field's value sits on a filled-in form.

${TAG_GUIDE}

Rules:
- Use only the field keys you are given, each at most once, in the order the values appear on the form.
- For a "selectionMark" field, point at its checkbox S tag whether or not it is ticked, with empty text.
- For other fields, give one ref per line or cell the value occupies, with the value's exact text there. Never include the printed caption.
- Leave refs empty when the field is blank on this copy. Never guess.`;

export function buildSuggestLabelsPrompt(
  fields: PromptField[],
  taggedText: string,
): string {
  const list = fields
    .map(
      (field) =>
        `- ${field.key} (${field.type})${field.description ? `: ${field.description}` : ""}`,
    )
    .join("\n");
  return `Fields:
${list}

<document>
${taggedText}
</document>`;
}
```

- [ ] **Step 3: Write the failing service tests**

Create `apps/backend-services/src/template-model/label-suggestions/label-suggestion.service.spec.ts`:

```ts
import { FieldType } from "@generated/client";
import { HttpException, NotFoundException } from "@nestjs/common";
import type { AnalysisResult } from "@/ocr/azure-types";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { syntheticLayoutResult } from "@/testUtils/synthetic-layout";
import type { TemplateModelDbService } from "../template-model-db.service";
import type {
  LabeledDocumentData,
  TemplateModelData,
} from "../template-model-db.types";
import {
  LabelSuggestionService,
  normalizeFieldKey,
} from "./label-suggestion.service";
import type { SuggestionLlmService } from "./suggestion-llm";

function templateModelWith(
  fields: Array<{
    key: string;
    type: FieldType;
    description: string | null;
  }>,
): TemplateModelData {
  return {
    id: "tm-1",
    name: "Test",
    model_id: "test",
    description: null,
    created_by: "user-1",
    created_at: new Date(),
    updated_at: new Date(),
    status: "draft",
    group_id: "group-1",
    field_schema: fields.map((field, index) => ({
      id: `f${index}`,
      template_model_id: "tm-1",
      field_key: field.key,
      field_type: field.type,
      field_format: null,
      format_spec: null,
      description: field.description,
      display_order: index,
    })),
  } as unknown as TemplateModelData;
}

function documentWith(result: AnalysisResult | null): LabeledDocumentData {
  return {
    id: "ld-1",
    template_model_id: "tm-1",
    labeling_document_id: "doc-1",
    status: "unlabeled",
    created_at: new Date(),
    updated_at: new Date(),
    labels: [],
    labeling_document: {
      ocr_result: result
        ? {
            status: "succeeded",
            createdDateTime: "",
            lastUpdatedDateTime: "",
            analyzeResult: result,
          }
        : null,
    },
  } as unknown as LabeledDocumentData;
}

describe("LabelSuggestionService", () => {
  const templateModelDb = {
    findTemplateModel: jest.fn(),
    findLabeledDocument: jest.fn(),
  };
  const llm = { generate: jest.fn() };
  const service = new LabelSuggestionService(
    templateModelDb as unknown as TemplateModelDbService,
    llm as unknown as SuggestionLlmService,
    mockAppLogger,
  );
  const fields = templateModelWith([
    {
      key: "name",
      type: FieldType.string,
      description: "Applicant name, after the caption",
    },
    { key: "wants_help", type: FieldType.selectionMark, description: null },
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    templateModelDb.findTemplateModel.mockResolvedValue(fields);
    templateModelDb.findLabeledDocument.mockResolvedValue(
      documentWith(syntheticLayoutResult()),
    );
  });

  describe("suggestLabels", () => {
    it("turns the reply's tags into labels and ignores unknown keys", async () => {
      llm.generate.mockResolvedValue({
        fields: [
          { key: "name", refs: [{ tag: "L1", text: "Jane Doe" }] },
          { key: "wants_help", refs: [{ tag: "S1", text: "" }] },
          { key: "not_a_field", refs: [{ tag: "L2", text: "Yes" }] },
        ],
      });

      const suggestions = await service.suggestLabels("tm-1", "doc-1");

      expect(suggestions).toEqual([
        {
          field_key: "name",
          label_name: "name",
          value: "Jane Doe",
          page_number: 1,
          element_ids: ["p1-w1", "p1-w2"],
          bounding_box: { polygon: [2, 0, 5, 0, 5, 1, 2, 1] },
          source_type: "llm",
          explanation: "Line L1",
        },
        {
          field_key: "wants_help",
          label_name: "wants_help",
          value: "selected",
          page_number: 1,
          element_ids: ["p1-sm0"],
          bounding_box: { polygon: [0, 2, 1, 2, 1, 3, 0, 3] },
          source_type: "llm",
          explanation: "Checkbox S1",
        },
      ]);
    });

    it("sends the field list with descriptions and the tagged text", async () => {
      llm.generate.mockResolvedValue({ fields: [] });

      await service.suggestLabels("tm-1", "doc-1");

      const call = llm.generate.mock.calls[0][0];
      expect(call.prompt).toContain(
        "- name (string): Applicant name, after the caption",
      );
      expect(call.prompt).toContain("- wants_help (selectionMark)");
      expect(call.prompt).toContain("[L1] Name Jane Doe");
      expect(call.schemaName).toBe("suggested_labels");
    });

    it("drops a field whose text is not on its tag", async () => {
      llm.generate.mockResolvedValue({
        fields: [{ key: "name", refs: [{ tag: "L1", text: "John Smith" }] }],
      });
      await expect(service.suggestLabels("tm-1", "doc-1")).resolves.toEqual([]);
    });

    it("refuses with 422 when the template model has no fields", async () => {
      templateModelDb.findTemplateModel.mockResolvedValue(templateModelWith([]));
      const error = await service
        .suggestLabels("tm-1", "doc-1")
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(422);
      expect(llm.generate).not.toHaveBeenCalled();
    });

    it("refuses with 422 when the document is too long", async () => {
      const base = syntheticLayoutResult();
      templateModelDb.findLabeledDocument.mockResolvedValue(
        documentWith({
          ...base,
          pages: Array.from({ length: 31 }, (_, i) => ({
            ...base.pages[0],
            pageNumber: i + 1,
          })),
        }),
      );
      const error = await service
        .suggestLabels("tm-1", "doc-1")
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(422);
    });

    it("returns 404 when the document has no OCR result", async () => {
      templateModelDb.findLabeledDocument.mockResolvedValue(documentWith(null));
      await expect(service.suggestLabels("tm-1", "doc-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns 404 for an unknown document", async () => {
      templateModelDb.findLabeledDocument.mockResolvedValue(null);
      await expect(service.suggestLabels("tm-1", "doc-9")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("suggestFields", () => {
    it("normalises and de-duplicates keys, resolves values and flags existing keys", async () => {
      llm.generate.mockResolvedValue({
        fields: [
          {
            key: "Applicant Name",
            type: "string",
            description: " Name after the caption ",
            refs: [{ tag: "L1", text: "Jane Doe" }],
          },
          {
            key: "applicant name",
            type: "string",
            description: "Second applicant name",
            refs: [],
          },
          {
            key: "wants_help",
            type: "selectionMark",
            description: "Ticked when help is wanted",
            refs: [{ tag: "S1", text: "" }],
          },
        ],
      });

      await expect(service.suggestFields("tm-1", "doc-1")).resolves.toEqual([
        {
          field_key: "applicant_name",
          field_type: "string",
          description: "Name after the caption",
          value: "Jane Doe",
          page_number: 1,
          already_exists: false,
        },
        {
          field_key: "applicant_name_2",
          field_type: "string",
          description: "Second applicant name",
          value: null,
          page_number: null,
          already_exists: false,
        },
        {
          field_key: "wants_help",
          field_type: "selectionMark",
          description: "Ticked when help is wanted",
          value: "selected",
          page_number: 1,
          already_exists: true,
        },
      ]);
      expect(llm.generate.mock.calls[0][0].schemaName).toBe("suggested_fields");
    });
  });

  describe("normalizeFieldKey", () => {
    it.each([
      ["Applicant Name", "applicant_name"],
      ["  --  ", "field"],
      ["2nd line", "field_2nd_line"],
      ["already_snake", "already_snake"],
    ])("turns %p into %p", (raw, expected) => {
      expect(normalizeFieldKey(raw)).toBe(expected);
    });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/label-suggestion.service.spec.ts`
Expected: FAIL with `Cannot find module './label-suggestion.service'`.

- [ ] **Step 5: Implement the service**

Create `apps/backend-services/src/template-model/label-suggestions/label-suggestion.service.ts`:

```ts
import { FieldType } from "@generated/client";
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import type { AnalysisResponse } from "@/ocr/azure-types";
import { FieldType as DtoFieldType } from "../dto/field-definition.dto";
import type { SuggestedFieldDto } from "../dto/field-suggestion.dto";
import type { LabelSuggestionDto } from "../dto/suggestion.dto";
import { TemplateModelDbService } from "../template-model-db.service";
import type { TemplateModelData } from "../template-model-db.types";
import {
  buildSuggestFieldsPrompt,
  buildSuggestLabelsPrompt,
  SUGGEST_FIELDS_SYSTEM,
  SUGGEST_LABELS_SYSTEM,
  type SuggestedFieldType,
  suggestFieldsReplySchema,
  suggestLabelsReplySchema,
} from "./prompts";
import { resolveRefs, type SuggestedRef } from "./resolve-refs";
import { SuggestionLlmService } from "./suggestion-llm";
import {
  renderTaggedText,
  type TaggedText,
  TaggedTextLimitError,
} from "./tagged-text";

/** Suggested-field replies are cut to this many fields. */
export const MAX_SUGGESTED_FIELDS = 200;

const DTO_FIELD_TYPES: Record<SuggestedFieldType, DtoFieldType> = {
  string: DtoFieldType.STRING,
  number: DtoFieldType.NUMBER,
  date: DtoFieldType.DATE,
  selectionMark: DtoFieldType.SELECTION_MARK,
  signature: DtoFieldType.SIGNATURE,
};

@Injectable()
export class LabelSuggestionService {
  constructor(
    private readonly templateModelDb: TemplateModelDbService,
    private readonly llm: SuggestionLlmService,
    private readonly logger: AppLoggerService,
  ) {}

  /** Suggested labels for one document; at most one per field, nothing guessed. */
  async suggestLabels(
    templateModelId: string,
    documentId: string,
  ): Promise<LabelSuggestionDto[]> {
    const { templateModel, tagged } = await this.load(
      templateModelId,
      documentId,
    );
    if (templateModel.field_schema.length === 0) {
      throw new HttpException(
        {
          message:
            "Add fields to the template model before loading suggestions",
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const reply = await this.llm.generate({
      system: SUGGEST_LABELS_SYSTEM,
      prompt: buildSuggestLabelsPrompt(
        templateModel.field_schema.map((field) => ({
          key: field.field_key,
          type: field.field_type,
          description: field.description,
        })),
        tagged.text,
      ),
      schema: suggestLabelsReplySchema,
      schemaName: "suggested_labels",
    });

    const fieldsByKey = new Map(
      templateModel.field_schema.map((field) => [field.field_key, field]),
    );
    const claimed = new Set<string>();
    const seen = new Set<string>();
    const suggestions: LabelSuggestionDto[] = [];
    for (const item of reply.fields) {
      const field = fieldsByKey.get(item.key);
      if (!field || seen.has(item.key)) continue;
      seen.add(item.key);
      const resolved = resolveRefs(
        item.refs,
        tagged,
        field.field_type === FieldType.selectionMark,
        claimed,
      );
      if (!resolved) {
        if (item.refs.length > 0) {
          this.logger.debug("Dropped a suggested label that did not match", {
            field_key: item.key,
          });
        }
        continue;
      }
      for (const id of resolved.elementIds) claimed.add(id);
      suggestions.push({
        field_key: field.field_key,
        label_name: field.field_key,
        value: resolved.value,
        page_number: resolved.pageNumber,
        element_ids: resolved.elementIds,
        bounding_box: { polygon: resolved.polygon },
        source_type: "llm",
        explanation: explainRefs(item.refs),
      });
    }
    return suggestions;
  }

  /** Suggested fields read from one document, with the value found for each. */
  async suggestFields(
    templateModelId: string,
    documentId: string,
  ): Promise<SuggestedFieldDto[]> {
    const { templateModel, tagged } = await this.load(
      templateModelId,
      documentId,
    );
    const reply = await this.llm.generate({
      system: SUGGEST_FIELDS_SYSTEM,
      prompt: buildSuggestFieldsPrompt(tagged.text),
      schema: suggestFieldsReplySchema,
      schemaName: "suggested_fields",
    });

    const existing = new Set(
      templateModel.field_schema.map((field) => field.field_key),
    );
    const usedKeys = new Set<string>();
    const claimed = new Set<string>();
    const result: SuggestedFieldDto[] = [];
    for (const item of reply.fields.slice(0, MAX_SUGGESTED_FIELDS)) {
      const key = uniqueKey(normalizeFieldKey(item.key), usedKeys);
      usedKeys.add(key);
      const resolved = resolveRefs(
        item.refs,
        tagged,
        item.type === "selectionMark",
        claimed,
      );
      if (resolved) {
        for (const id of resolved.elementIds) claimed.add(id);
      }
      result.push({
        field_key: key,
        field_type: DTO_FIELD_TYPES[item.type],
        description: item.description.trim(),
        value: resolved?.value ?? null,
        page_number: resolved?.pageNumber ?? null,
        already_exists: existing.has(key),
      });
    }
    return result;
  }

  private async load(
    templateModelId: string,
    documentId: string,
  ): Promise<{ templateModel: TemplateModelData; tagged: TaggedText }> {
    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }
    const labeledDoc = await this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }
    const ocr = labeledDoc.labeling_document
      .ocr_result as unknown as AnalysisResponse | null;
    if (!ocr?.analyzeResult) {
      throw new NotFoundException(
        `OCR result not found for labeling document ${documentId}`,
      );
    }
    try {
      return { templateModel, tagged: renderTaggedText(ocr.analyzeResult) };
    } catch (error) {
      if (error instanceof TaggedTextLimitError) {
        throw new HttpException(
          { message: error.message },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw error;
    }
  }
}

/** Lowercase snake_case starting with a letter; "field" when nothing is left. */
export function normalizeFieldKey(raw: string): string {
  const key = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (key.length === 0) return "field";
  return /^[a-z]/.test(key) ? key : `field_${key}`;
}

function uniqueKey(key: string, used: ReadonlySet<string>): string {
  if (!used.has(key)) return key;
  let suffix = 2;
  while (used.has(`${key}_${suffix}`)) suffix += 1;
  return `${key}_${suffix}`;
}

function explainRefs(refs: SuggestedRef[]): string {
  return refs
    .map((ref) => {
      const tag = ref.tag.trim();
      if (tag.startsWith("S")) return `Checkbox ${tag}`;
      if (tag.startsWith("T")) return `Table cell ${tag}`;
      return `Line ${tag}`;
    })
    .join(", ");
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/backend-services && npm test -- src/template-model/label-suggestions/label-suggestion.service.spec.ts`
Expected: PASS (12 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/backend-services/src/template-model/label-suggestions/prompts.ts \
  apps/backend-services/src/template-model/label-suggestions/label-suggestion.service.ts \
  apps/backend-services/src/template-model/label-suggestions/label-suggestion.service.spec.ts \
  apps/backend-services/src/template-model/dto/field-suggestion.dto.ts \
  apps/backend-services/src/template-model/dto/suggestion.dto.ts
git commit -m "feat(label-suggestions): suggested fields and labels from an LLM

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Endpoints, wiring, and removing the old engine

**Precondition:** the bench plan's baseline run against the current engine is recorded. This task deletes that engine.

**Files:**
- Modify: `apps/backend-services/src/template-model/template-model.controller.ts`
- Modify: `apps/backend-services/src/template-model/template-model.module.ts`
- Modify: `apps/backend-services/src/template-model/template-model.service.ts`
- Modify: `apps/backend-services/src/template-model/template-model.service.spec.ts`
- Modify: `apps/backend-services/src/template-model/template-model.controller.spec.ts`
- Delete: `apps/backend-services/src/template-model/suggestion.service.ts`, `suggestion.service.spec.ts`, `suggestion.service.integration.spec.ts`

**Interfaces:**
- Consumes: `LabelSuggestionService`, `SuggestionLlmService`, `SuggestFieldsDto` and `SuggestedFieldDto` (Tasks 5–6).
- Produces:
  - `POST /api/template-models/:id/documents/:docId/suggestions` now returns 200 with `LabelSuggestionDto[]`.
  - `POST /api/template-models/:id/field-suggestions` takes a `SuggestFieldsDto` body and returns 200 with `SuggestedFieldDto[]`.
  - Controller methods `generateDocumentSuggestions(req, id, docId)` and `suggestFields(id, dto, req)`.

- [ ] **Step 1: Write the failing controller tests**

In `template-model.controller.spec.ts`:

1. Add `import { LabelSuggestionService } from "./label-suggestions/label-suggestion.service";`.
2. Add `let labelSuggestionService: jest.Mocked<LabelSuggestionService>;` next to the other `let` declarations.
3. Remove `generateDocumentSuggestions: jest.fn(),` from the `templateModelService` mock object.
4. In `beforeEach`, before `Test.createTestingModule`, add:

```ts
    labelSuggestionService = {
      suggestLabels: jest.fn(),
      suggestFields: jest.fn(),
    } as unknown as jest.Mocked<LabelSuggestionService>;
```

5. Add this provider to the `providers` array:

```ts
        {
          provide: LabelSuggestionService,
          useValue: labelSuggestionService,
        },
```

6. Add this block inside the top-level `describe`:

```ts
  describe("label suggestions", () => {
    const memberReq = {
      resolvedIdentity: {
        actorId: "actor-1",
        isSystemAdmin: false,
        groupRoles: { "group-1": GroupRole.MEMBER },
      },
    } as unknown as Request;
    const outsiderReq = {
      resolvedIdentity: {
        actorId: "actor-2",
        isSystemAdmin: false,
        groupRoles: { "group-2": GroupRole.MEMBER },
      },
    } as unknown as Request;

    beforeEach(() => {
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
    });

    it("suggests labels after checking group access", async () => {
      labelSuggestionService.suggestLabels.mockResolvedValue([]);
      await expect(
        controller.generateDocumentSuggestions(memberReq, "tm-1", "doc-1"),
      ).resolves.toEqual([]);
      expect(labelSuggestionService.suggestLabels).toHaveBeenCalledWith(
        "tm-1",
        "doc-1",
      );
    });

    it("refuses label suggestions outside the group", async () => {
      await expect(
        controller.generateDocumentSuggestions(outsiderReq, "tm-1", "doc-1"),
      ).rejects.toThrow(ForbiddenException);
      expect(labelSuggestionService.suggestLabels).not.toHaveBeenCalled();
    });

    it("suggests fields from the chosen document", async () => {
      labelSuggestionService.suggestFields.mockResolvedValue([]);
      await controller.suggestFields("tm-1", { document_id: "doc-1" }, memberReq);
      expect(labelSuggestionService.suggestFields).toHaveBeenCalledWith(
        "tm-1",
        "doc-1",
      );
    });

    it("refuses field suggestions outside the group", async () => {
      await expect(
        controller.suggestFields("tm-1", { document_id: "doc-1" }, outsiderReq),
      ).rejects.toThrow(ForbiddenException);
      expect(labelSuggestionService.suggestFields).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend-services && npm test -- src/template-model/template-model.controller.spec.ts`
Expected: FAIL. `Property 'suggestFields' does not exist on type 'TemplateModelController'`.

- [ ] **Step 3: Rewire the controller**

In `template-model.controller.ts`:

1. Add `ApiBadGatewayResponse` and `ApiServiceUnavailableResponse` to the `@nestjs/swagger` import.
2. Add these imports:

```ts
import {
  SuggestedFieldDto,
  SuggestFieldsDto,
} from "./dto/field-suggestion.dto";
import { LabelSuggestionService } from "./label-suggestions/label-suggestion.service";
```

3. Add `private readonly labelSuggestionService: LabelSuggestionService,` as the last constructor parameter.
4. Replace the whole `generateDocumentSuggestions` endpoint (decorators included) with the following two endpoints:

```ts
  @Post(":id/documents/:docId/suggestions")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Suggest labels for a document: an LLM points at the OCR words and checkboxes holding each field's value",
  })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Labelling document ID" })
  @ApiOkResponse({
    description: "Suggested labels, at most one per field",
    type: [LabelSuggestionDto],
  })
  @ApiNotFoundResponse({
    description: "Template model, document or OCR result not found",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiUnprocessableEntityResponse({
    description:
      "The template model has no fields, or the document is too long for suggestions",
  })
  @ApiBadGatewayResponse({ description: "The suggestion model call failed" })
  @ApiServiceUnavailableResponse({
    description:
      "Label suggestions are not configured; the response names the missing settings",
  })
  async generateDocumentSuggestions(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("docId") documentId: string,
  ): Promise<LabelSuggestionDto[]> {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.labelSuggestionService.suggestLabels(id, documentId);
  }

  @Post(":id/field-suggestions")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Suggest a field list from one document's OCR, with the value found for each field",
  })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiOkResponse({
    description: "Suggested fields in the order they appear on the document",
    type: [SuggestedFieldDto],
  })
  @ApiNotFoundResponse({
    description: "Template model, document or OCR result not found",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiUnprocessableEntityResponse({
    description: "The document is too long for suggestions",
  })
  @ApiBadGatewayResponse({ description: "The suggestion model call failed" })
  @ApiServiceUnavailableResponse({
    description:
      "Label suggestions are not configured; the response names the missing settings",
  })
  async suggestFields(
    @Param("id") id: string,
    @Body() dto: SuggestFieldsDto,
    @Req() req: Request,
  ): Promise<SuggestedFieldDto[]> {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.labelSuggestionService.suggestFields(id, dto.document_id);
  }
```

- [ ] **Step 4: Register the providers and remove the old one**

Replace the whole `template-model.module.ts` with:

```ts
import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AzureModule } from "../azure/azure.module";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { FormatSuggestionService } from "./format-suggestion.service";
import { LabelSuggestionService } from "./label-suggestions/label-suggestion.service";
import { SuggestionLlmService } from "./label-suggestions/suggestion-llm";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { TemplateModelController } from "./template-model.controller";
import { TemplateModelService } from "./template-model.service";
import { TemplateModelDbService } from "./template-model-db.service";
import { TemplateModelOcrService } from "./template-model-ocr.service";

@Module({
  imports: [
    DatabaseModule,
    HttpModule,
    BlobStorageModule,
    DocumentModule,
    AuditModule,
    AzureModule,
  ],
  controllers: [TemplateModelController],
  providers: [
    TemplateModelService,
    TemplateModelDbService,
    LabelingDocumentDbService,
    TemplateModelOcrService,
    LabelSuggestionService,
    SuggestionLlmService,
    FormatSuggestionService,
  ],
  exports: [TemplateModelService],
})
export class TemplateModelModule {}
```

- [ ] **Step 5: Remove the old engine from the template-model service**

In `template-model.service.ts`:

1. Delete the whole `generateDocumentSuggestions` method.
2. Delete `import { LabelSuggestionDto } from "./dto/suggestion.dto";` and `import { SuggestionService } from "./suggestion.service";`.
3. Delete the constructor parameter `private readonly suggestionService: SuggestionService,`.
4. Change `import { AnalysisResponse, Page } from "@/ocr/azure-types";` to `import { Page } from "@/ocr/azure-types";`. `AnalysisResponse` was only used by the deleted method.

In `template-model.service.spec.ts`:

1. Delete `import { SuggestionService } from "./suggestion.service";`, `let mockSuggestionService: jest.Mocked<SuggestionService>;`, the `mockSuggestions` object, the `{ provide: SuggestionService, useValue: mockSuggestions }` provider, and `mockSuggestionService = module.get(SuggestionService);`.
2. Delete the whole `describe("generateDocumentSuggestions", …)` block, which runs from line 910 to its closing `});` at line 994 before these edits.
3. Delete `import { ResolvedIdentity } from "@/auth/types";`. Only the deleted block used it.

Delete the old engine files:

```bash
git rm apps/backend-services/src/template-model/suggestion.service.ts \
  apps/backend-services/src/template-model/suggestion.service.spec.ts \
  apps/backend-services/src/template-model/suggestion.service.integration.spec.ts
```

Keep `apps/backend-services/test/fixtures/ocr_output.json`, `form_image_0.jpg.labels.json` and `fields.json`; Tasks 3–4 use them.

Run: `grep -rnE '\bSuggestionService\b|\./suggestion\.service' apps/backend-services/src`
Expected: no output. `FormatSuggestionService` and `./format-suggestion.service` don't match: `\bSuggestionService` needs a word boundary before the `S`, and `./suggestion.service` needs `./` directly before `suggestion`. If grep shows anything, remove that stale reference.

- [ ] **Step 6: Run the tests, lint and type-check**

Run: `cd apps/backend-services && npm test -- src/template-model`
Expected: PASS, and the `Tests:` line shows no failures.

Run: `cd apps/backend-services && npm run lint`
Expected: no errors in the changed files. Fix any reported issues, such as import order or unused imports, with `npm run lint:fix` and re-run.

Run: `cd apps/backend-services && npm run type-check`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/backend-services/src/template-model/template-model.controller.ts \
  apps/backend-services/src/template-model/template-model.module.ts \
  apps/backend-services/src/template-model/template-model.service.ts \
  apps/backend-services/src/template-model/template-model.service.spec.ts \
  apps/backend-services/src/template-model/template-model.controller.spec.ts
git commit -m "feat(template-model): serve LLM suggestions and remove the rule-based engine

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(The `git rm` in Step 5 already staged the deletions.)

---

### Task 8: Frontend data hooks

**Files:**
- Modify: `apps/frontend/src/features/annotation/core/types/field.ts`
- Modify: `apps/frontend/src/features/annotation/template-models/hooks/useFieldSchema.ts`
- Create: `apps/frontend/src/features/annotation/template-models/hooks/useFieldSuggestions.ts`
- Modify: `apps/frontend/src/features/annotation/template-models/hooks/useSuggestions.ts`
- Test: `apps/frontend/src/features/annotation/template-models/hooks/useFieldSchema.test.ts`
- Test: `apps/frontend/src/features/annotation/template-models/hooks/useFieldSuggestions.test.ts`
- Test: `apps/frontend/src/features/annotation/template-models/hooks/useSuggestions.test.ts`

**Interfaces:**
- Consumes: `POST …/fields/bulk` (Task 2), `POST …/field-suggestions` (Task 7), `POST …/suggestions` (Task 7).
- Produces:
  - `FieldDefinition.description?: string`.
  - `export interface CreateFieldDefinitionDto` from `useFieldSchema.ts`.
  - `useFieldSchema()` additionally returns `addFieldsAsync(fields: CreateFieldDefinitionDto[]): Promise<FieldDefinition[]>` and `isAddingFields`.
  - `export interface SuggestedField { field_key; field_type: FieldType; description; value: string | null; page_number: number | null; already_exists }`.
  - `useFieldSuggestions(templateModelId)` returns `{ suggestFieldsAsync(documentId: string): Promise<SuggestedField[]>, isSuggestingFields }`.
  - The mutations in `useSuggestions` and the two new hooks reject with the server's message when `response.success` is false.

- [ ] **Step 1: Write the failing hook tests**

Create `apps/frontend/src/features/annotation/template-models/hooks/useFieldSuggestions.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { FieldType } from "../../core/types/field";
import { useFieldSuggestions } from "./useFieldSuggestions";

vi.mock("@/data/services/api.service", () => ({
  apiService: { post: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const suggested = {
  field_key: "file_number",
  field_type: FieldType.STRING,
  description: "Court file number",
  value: "S-251234",
  page_number: 1,
  already_exists: false,
};

describe("useFieldSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the document id and returns the suggested fields", async () => {
    vi.mocked(apiService.post).mockResolvedValue({
      data: [suggested],
      success: true,
    });
    const { result } = renderHook(() => useFieldSuggestions("tm-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.suggestFieldsAsync("doc-1")).resolves.toEqual([
      suggested,
    ]);
    expect(apiService.post).toHaveBeenCalledWith(
      "/template-models/tm-1/field-suggestions",
      { document_id: "doc-1" },
    );
  });

  it("rejects with the server's message", async () => {
    vi.mocked(apiService.post).mockResolvedValue({
      data: null,
      success: false,
      message: "Label suggestions are not configured",
    });
    const { result } = renderHook(() => useFieldSuggestions("tm-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.suggestFieldsAsync("doc-1")).rejects.toThrow(
      "Label suggestions are not configured",
    );
  });
});
```

Create `apps/frontend/src/features/annotation/template-models/hooks/useSuggestions.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { useSuggestions } from "./useSuggestions";

vi.mock("@/data/services/api.service", () => ({
  apiService: { post: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the suggested labels", async () => {
    const suggestion = {
      field_key: "name",
      label_name: "name",
      value: "Jane Doe",
      page_number: 1,
      element_ids: ["p1-w1", "p1-w2"],
      bounding_box: { polygon: [2, 0, 5, 0, 5, 1, 2, 1] },
      source_type: "llm",
      explanation: "Line L1",
    };
    vi.mocked(apiService.post).mockResolvedValue({
      data: [suggestion],
      success: true,
    });
    const { result } = renderHook(() => useSuggestions("tm-1", "doc-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.loadSuggestionsAsync()).resolves.toEqual([
      suggestion,
    ]);
    expect(apiService.post).toHaveBeenCalledWith(
      "/template-models/tm-1/documents/doc-1/suggestions",
      {},
    );
  });

  it("rejects with the server's message so the screen can show it", async () => {
    vi.mocked(apiService.post).mockResolvedValue({
      data: null,
      success: false,
      message: "The suggestion model call failed",
    });
    const { result } = renderHook(() => useSuggestions("tm-1", "doc-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.loadSuggestionsAsync()).rejects.toThrow(
      "The suggestion model call failed",
    );
  });
});
```

Create `apps/frontend/src/features/annotation/template-models/hooks/useFieldSchema.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { FieldType } from "../../core/types/field";
import { useFieldSchema } from "./useFieldSchema";

vi.mock("@/data/services/api.service", () => ({
  apiService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFieldSchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the description from the API", async () => {
    vi.mocked(apiService.get).mockResolvedValue({
      data: [
        {
          id: "f1",
          field_key: "filing_date",
          field_type: "date",
          description: "Date at the bottom",
          display_order: 0,
        },
      ],
      success: true,
    });
    const { result } = renderHook(() => useFieldSchema("tm-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.schema).toHaveLength(1));
    expect(result.current.schema[0].description).toBe("Date at the bottom");
  });

  it("adds several fields through the bulk endpoint", async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: [], success: true });
    vi.mocked(apiService.post).mockResolvedValue({
      data: [
        {
          id: "f2",
          field_key: "file_number",
          field_type: "string",
          description: "Court file number",
          display_order: 0,
        },
      ],
      success: true,
    });
    const { result } = renderHook(() => useFieldSchema("tm-1"), {
      wrapper: createWrapper(),
    });

    const created = await result.current.addFieldsAsync([
      {
        field_key: "file_number",
        field_type: FieldType.STRING,
        description: "Court file number",
      },
    ]);

    expect(apiService.post).toHaveBeenCalledWith(
      "/template-models/tm-1/fields/bulk",
      {
        fields: [
          {
            field_key: "file_number",
            field_type: "string",
            description: "Court file number",
          },
        ],
      },
    );
    expect(created[0]).toEqual(
      expect.objectContaining({
        fieldKey: "file_number",
        description: "Court file number",
      }),
    );
  });

  it("rejects a failed bulk add with the server's message", async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: [], success: true });
    vi.mocked(apiService.post).mockResolvedValue({
      data: null,
      success: false,
      message: "These field keys already exist or repeat in the request",
    });
    const { result } = renderHook(() => useFieldSchema("tm-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.addFieldsAsync([
        { field_key: "a", field_type: FieldType.STRING },
      ]),
    ).rejects.toThrow("These field keys already exist or repeat in the request");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/annotation/template-models/hooks`
Expected: FAIL. The imports of `useFieldSuggestions` and `addFieldsAsync` fail, and `useSuggestions` resolves instead of rejecting.

- [ ] **Step 3: Implement**

In `apps/frontend/src/features/annotation/core/types/field.ts`, add `description?: string;` to `FieldDefinition`, after `formatSpec?: string;`.

In `hooks/useFieldSchema.ts`:
- Change `interface CreateFieldDefinitionDto` to `export interface CreateFieldDefinitionDto` and add `description?: string;`.
- Add `description?: string;` to `UpdateFieldDefinitionDto`.
- Add `description?: string | null;` to `ApiFieldDefinition`.
- In `normalizeSchema`, add `description: field.description ?? undefined,` after the `formatSpec` line.
- Add this mutation after `addFieldMutation`:

```ts
  const addFieldsMutation = useMutation({
    mutationFn: async (fields: CreateFieldDefinitionDto[]) => {
      const response = await apiService.post<ApiFieldDefinition[]>(
        `/template-models/${templateModelId}/fields/bulk`,
        { fields },
      );
      if (!response.success) {
        throw new Error(response.message ?? "Adding fields failed");
      }
      return normalizeSchema(response.data ?? []);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["template-model-field-schema", templateModelId],
      });
    },
  });
```

- Add these two lines to the returned object:

```ts
    addFieldsAsync: addFieldsMutation.mutateAsync,
    isAddingFields: addFieldsMutation.isPending,
```

Create `hooks/useFieldSuggestions.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import type { FieldType } from "../../core/types/field";

/** One field the LLM suggested from a document. */
export interface SuggestedField {
  field_key: string;
  field_type: FieldType;
  description: string;
  value: string | null;
  page_number: number | null;
  already_exists: boolean;
}

export const useFieldSuggestions = (templateModelId?: string) => {
  const suggestFieldsMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiService.post<SuggestedField[]>(
        `/template-models/${templateModelId}/field-suggestions`,
        { document_id: documentId },
      );
      if (!response.success) {
        throw new Error(response.message ?? "Suggesting fields failed");
      }
      return response.data ?? [];
    },
  });

  return {
    suggestFieldsAsync: suggestFieldsMutation.mutateAsync,
    isSuggestingFields: suggestFieldsMutation.isPending,
  };
};
```

In `hooks/useSuggestions.ts`, change the `source_type` line to `source_type: "llm";` and replace the `mutationFn` with:

```ts
    mutationFn: async () => {
      const response = await apiService.post<LabelSuggestionDto[]>(
        `/template-models/${templateModelId}/documents/${documentId}/suggestions`,
        {},
      );
      if (!response.success) {
        throw new Error(response.message ?? "Loading suggestions failed");
      }
      return response.data ?? [];
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/annotation/template-models/hooks`
Expected: PASS, with the new tests (2 + 2 + 3) and the existing `useTemplateModels` tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/annotation/core/types/field.ts \
  apps/frontend/src/features/annotation/template-models/hooks/useFieldSchema.ts \
  apps/frontend/src/features/annotation/template-models/hooks/useFieldSchema.test.ts \
  apps/frontend/src/features/annotation/template-models/hooks/useFieldSuggestions.ts \
  apps/frontend/src/features/annotation/template-models/hooks/useFieldSuggestions.test.ts \
  apps/frontend/src/features/annotation/template-models/hooks/useSuggestions.ts \
  apps/frontend/src/features/annotation/template-models/hooks/useSuggestions.test.ts
git commit -m "feat(frontend): hooks for field descriptions, bulk add and suggested fields

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Description on the Field schema tab

**Files:**
- Modify: `apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.tsx`
- Modify: `apps/frontend/src/features/annotation/template-models/pages/ModelDetailPage.tsx`
- Test: `apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.test.tsx`

**Interfaces:**
- Consumes: `FieldDefinition.description` (Task 8).
- Produces: `FieldSchemaEditor`'s `onSubmit` data gains `description: string` (trimmed; empty clears it).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../../../../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "../../../../ui";
import { FieldType } from "../../core/types/field";
import { FieldSchemaEditor } from "./FieldSchemaEditor";

describe("FieldSchemaEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the trimmed description with a new field", () => {
    const onSubmit = vi.fn();
    render(
      <MantineProvider>
        <FieldSchemaEditor opened onClose={vi.fn()} onSubmit={onSubmit} />
      </MantineProvider>,
    );

    fireEvent.change(screen.getByLabelText("Field key"), {
      target: { value: "filing_date" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Date at the bottom of the form  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save field" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        field_key: "filing_date",
        description: "Date at the bottom of the form",
      }),
    );
  });

  it("prefills the description when editing a field", () => {
    render(
      <MantineProvider>
        <FieldSchemaEditor
          opened
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          initialValue={{
            id: "f1",
            fieldKey: "filing_date",
            fieldType: FieldType.DATE,
            displayOrder: 0,
            description: "Date at the bottom of the form",
          }}
        />
      </MantineProvider>,
    );

    expect(screen.getByLabelText("Description")).toHaveValue(
      "Date at the bottom of the form",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/annotation/template-models/components/FieldSchemaEditor.test.tsx`
Expected: FAIL. `Unable to find a label with the text of: Description`.

- [ ] **Step 3: Add the description to the editor**

In `FieldSchemaEditor.tsx`:
- Add `Textarea,` to the `../../../../ui` import.
- Add `description: string;` to the `onSubmit` data type in `FieldSchemaEditorProps`.
- Add `const [description, setDescription] = useState("");` after the `displayTemplate` state.
- In the `useEffect`, add `setDescription(initialValue?.description || "");` after `setFieldFormat(…)`.
- In `handleSubmit`, add `description: description.trim(),` to the `onSubmit({ … })` object.
- In the JSX, add this directly after the field-type `<Select … />`:

```tsx
        <Textarea
          label="Description"
          description="One sentence on what the field is and where it sits on the form. Used when suggesting fields and labels."
          placeholder="Date the applicant signed, next to their signature"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
```

- [ ] **Step 4: Show and save the description on the Field schema tab**

In `ModelDetailPage.tsx`:
- Add `description?: string;` to `interface FieldFormData`.
- In `handleSaveField`, add `description: data.description,` to the `updateField` data. Add `description: data.description || undefined,` to the `addField` payload.
- In the schema table header, add `<DataTable.Th>Description</DataTable.Th>` after `<DataTable.Th>Type</DataTable.Th>`.
- In the schema table row, add `<DataTable.Td>{field.description || "—"}</DataTable.Td>` after `<DataTable.Td>{field.fieldType}</DataTable.Td>`.

- [ ] **Step 5: Run the tests, lint and type-check**

Run: `cd apps/frontend && npx vitest run src/features/annotation/template-models`
Expected: PASS.

Run: `cd apps/frontend && npm run lint && npm run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.tsx \
  apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.test.tsx \
  apps/frontend/src/features/annotation/template-models/pages/ModelDetailPage.tsx
git commit -m "feat(frontend): edit and show field descriptions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Suggest fields from a document

**Files:**
- Create: `apps/frontend/src/features/annotation/template-models/components/SuggestFieldsModal.tsx`
- Test: `apps/frontend/src/features/annotation/template-models/components/SuggestFieldsModal.test.tsx`
- Modify: `apps/frontend/src/features/annotation/template-models/pages/ModelDetailPage.tsx`

**Interfaces:**
- Consumes: `useFieldSuggestions` and `SuggestedField` (Task 8); `CreateFieldDefinitionDto` and `useFieldSchema().addFieldsAsync` (Task 8).
- Produces: `SuggestFieldsModal`, with these props:
  - `opened` and `onClose`;
  - `templateModelId`;
  - `documents: SuggestFieldsDocumentOption[]`, where `SuggestFieldsDocumentOption` is `{ id; name }`;
  - `onAddFields(fields: CreateFieldDefinitionDto[]): Promise<void>`;
  - `onFieldsAdded(documentId: string, count: number)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/annotation/template-models/components/SuggestFieldsModal.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../../../../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

const mockSuggestFieldsAsync = vi.fn();

vi.mock("../hooks/useFieldSuggestions", () => ({
  useFieldSuggestions: () => ({
    suggestFieldsAsync: mockSuggestFieldsAsync,
    isSuggestingFields: false,
  }),
}));

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "../../../../ui";
import { FieldType } from "../../core/types/field";
import { SuggestFieldsModal } from "./SuggestFieldsModal";

const suggestions = [
  {
    field_key: "file_number",
    field_type: FieldType.STRING,
    description: "Court file number after 'No.'",
    value: "S-251234",
    page_number: 1,
    already_exists: false,
  },
  {
    field_key: "consents",
    field_type: FieldType.SELECTION_MARK,
    description: "Ticked when the defendant consents",
    value: "selected",
    page_number: 1,
    already_exists: true,
  },
  {
    field_key: "filing_date",
    field_type: FieldType.DATE,
    description: "Date at the bottom",
    value: null,
    page_number: null,
    already_exists: false,
  },
];

function renderModal() {
  const props = {
    opened: true,
    onClose: vi.fn(),
    templateModelId: "tm-1",
    documents: [{ id: "doc-1", name: "copy-1.pdf" }],
    onAddFields: vi.fn().mockResolvedValue(undefined),
    onFieldsAdded: vi.fn(),
  };
  render(
    <MantineProvider>
      <SuggestFieldsModal {...props} />
    </MantineProvider>,
  );
  return props;
}

async function suggest() {
  fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
  await waitFor(() =>
    expect(screen.getByTestId("suggested-field-2")).toBeInTheDocument(),
  );
}

describe("SuggestFieldsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestFieldsAsync.mockResolvedValue(suggestions);
  });

  it("suggests fields for the first document and leaves existing keys unticked", async () => {
    renderModal();
    await suggest();

    expect(mockSuggestFieldsAsync).toHaveBeenCalledWith("doc-1");
    expect(
      within(screen.getByTestId("suggested-field-0")).getByRole("checkbox"),
    ).toBeChecked();
    expect(
      within(screen.getByTestId("suggested-field-1")).getByRole("checkbox"),
    ).not.toBeChecked();
    expect(screen.getByText("Not filled in on this document")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 fields" })).toBeInTheDocument();
  });

  it("adds the ticked fields with the user's edits", async () => {
    const props = renderModal();
    await suggest();

    fireEvent.change(
      within(screen.getByTestId("suggested-field-0")).getByLabelText("Key"),
      { target: { value: "court_file_number" } },
    );
    fireEvent.click(
      within(screen.getByTestId("suggested-field-2")).getByRole("checkbox"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 1 field" }));

    await waitFor(() =>
      expect(props.onFieldsAdded).toHaveBeenCalledWith("doc-1", 1),
    );
    expect(props.onAddFields).toHaveBeenCalledWith([
      {
        field_key: "court_file_number",
        field_type: FieldType.STRING,
        description: "Court file number after 'No.'",
      },
    ]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows the error when suggesting fails", async () => {
    mockSuggestFieldsAsync.mockRejectedValue(
      new Error("Label suggestions are not configured"),
    );
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));

    expect(
      await screen.findByText("Label suggestions are not configured"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/annotation/template-models/components/SuggestFieldsModal.test.tsx`
Expected: FAIL with `Failed to resolve import "./SuggestFieldsModal"`.

- [ ] **Step 3: Implement the modal**

Create `apps/frontend/src/features/annotation/template-models/components/SuggestFieldsModal.tsx`:

```tsx
import { FC, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "../../../../ui";
import { FieldType } from "../../core/types/field";
import type { CreateFieldDefinitionDto } from "../hooks/useFieldSchema";
import {
  type SuggestedField,
  useFieldSuggestions,
} from "../hooks/useFieldSuggestions";

export interface SuggestFieldsDocumentOption {
  /** Labelling document id. */
  id: string;
  name: string;
}

interface SuggestFieldsModalProps {
  opened: boolean;
  onClose: () => void;
  templateModelId: string;
  /** Documents whose OCR has finished. */
  documents: SuggestFieldsDocumentOption[];
  onAddFields: (fields: CreateFieldDefinitionDto[]) => Promise<void>;
  onFieldsAdded: (documentId: string, count: number) => void;
}

interface Row {
  id: string;
  include: boolean;
  fieldKey: string;
  fieldType: FieldType;
  description: string;
  value: string | null;
  alreadyExists: boolean;
}

const toRow = (suggestion: SuggestedField, index: number): Row => ({
  id: `${index}-${suggestion.field_key}`,
  include: !suggestion.already_exists,
  fieldKey: suggestion.field_key,
  fieldType: suggestion.field_type,
  description: suggestion.description,
  value: suggestion.value,
  alreadyExists: suggestion.already_exists,
});

export const SuggestFieldsModal: FC<SuggestFieldsModalProps> = ({
  opened,
  onClose,
  templateModelId,
  documents,
  onAddFields,
  onFieldsAdded,
}) => {
  const { suggestFieldsAsync, isSuggestingFields } =
    useFieldSuggestions(templateModelId);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const selectedDocumentId = documentId ?? documents[0]?.id ?? null;
  const includedCount = rows.filter((row) => row.include).length;
  const hasBlankKey = rows.some(
    (row) => row.include && row.fieldKey.trim() === "",
  );
  const typeOptions = useMemo(
    () => Object.values(FieldType).map((value) => ({ value, label: value })),
    [],
  );

  const handleClose = () => {
    setDocumentId(null);
    setRows([]);
    setError(null);
    onClose();
  };

  const handleSuggest = async () => {
    if (!selectedDocumentId) return;
    setError(null);
    try {
      const suggested = await suggestFieldsAsync(selectedDocumentId);
      setRows(suggested.map(toRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggesting fields failed");
    }
  };

  const handleAdd = async () => {
    if (!selectedDocumentId) return;
    setIsAdding(true);
    setError(null);
    try {
      const fields: CreateFieldDefinitionDto[] = rows
        .filter((row) => row.include)
        .map((row) => ({
          field_key: row.fieldKey.trim(),
          field_type: row.fieldType,
          description: row.description.trim() || undefined,
        }));
      await onAddFields(fields);
      onFieldsAdded(selectedDocumentId, fields.length);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adding fields failed");
    } finally {
      setIsAdding(false);
    }
  };

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  return (
    <Modal opened={opened} onClose={handleClose} title="Suggest fields">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Pick a document whose OCR has finished. The fields are suggested from
          what is filled in on it; check them before adding.
        </Text>
        {documents.length === 0 ? (
          <Text size="sm">No document has finished OCR yet.</Text>
        ) : (
          <Group align="flex-end">
            <Select
              label="Document"
              data={documents.map((doc) => ({ value: doc.id, label: doc.name }))}
              value={selectedDocumentId}
              onChange={(value) => setDocumentId(value)}
            />
            <Button
              onClick={() => void handleSuggest()}
              loading={isSuggestingFields}
              disabled={!selectedDocumentId}
            >
              Suggest
            </Button>
          </Group>
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {isSuggestingFields && <Loader size="sm" />}
        {rows.map((row, index) => (
          <Group
            key={row.id}
            data-testid={`suggested-field-${index}`}
            align="flex-end"
            wrap="nowrap"
          >
            <Checkbox
              label="Include"
              checked={row.include}
              onChange={(event) =>
                updateRow(row.id, { include: event.currentTarget.checked })
              }
            />
            <TextInput
              label="Key"
              value={row.fieldKey}
              onChange={(event) =>
                updateRow(row.id, { fieldKey: event.currentTarget.value })
              }
            />
            <Select
              label="Type"
              data={typeOptions}
              value={row.fieldType}
              onChange={(value) => {
                if (value) updateRow(row.id, { fieldType: value as FieldType });
              }}
            />
            <TextInput
              label="Description"
              value={row.description}
              onChange={(event) =>
                updateRow(row.id, { description: event.currentTarget.value })
              }
            />
            <Text size="sm" c="dimmed">
              {row.value ?? "Not filled in on this document"}
            </Text>
            {row.alreadyExists && (
              <Badge size="sm" variant="light">
                Exists
              </Badge>
            )}
          </Group>
        ))}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAdd()}
            loading={isAdding}
            disabled={includedCount === 0 || hasBlankKey}
          >
            {`Add ${includedCount} field${includedCount === 1 ? "" : "s"}`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/annotation/template-models/components/SuggestFieldsModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the modal into the Field schema tab**

In `ModelDetailPage.tsx`:
- Add `IconWand,` to the `@tabler/icons-react` import.
- Add `import { SuggestFieldsModal } from "../components/SuggestFieldsModal";`.
- Add `addFieldsAsync,` to the `useFieldSchema(routeModelId)` destructuring.
- Add `const [suggestFieldsOpen, setSuggestFieldsOpen] = useState(false);` after `const [schemaEditorOpen, …]`.
- Add this handler after `handleSaveField`:

```tsx
  const handleFieldsAdded = (documentId: string, count: number) => {
    notifications.show({
      title: count === 1 ? "1 field added" : `${count} fields added`,
      message: (
        <Button
          size="xs"
          variant="light"
          onClick={() =>
            navigate(`/template-models/${routeModelId}/document/${documentId}`)
          }
        >
          Open the document to check its suggested labels
        </Button>
      ),
      color: "green",
    });
  };
```

- In the schema tab's header `<Group gap="xs">`, add this button immediately before the `Suggest formats` button:

```tsx
                <Button
                  variant="light"
                  leftSection={<IconWand size={16} />}
                  onClick={() => setSuggestFieldsOpen(true)}
                >
                  Suggest fields
                </Button>
```

- Directly after the `<FieldSchemaEditor … />` element near the end of the file, add:

```tsx
      <SuggestFieldsModal
        opened={suggestFieldsOpen}
        onClose={() => setSuggestFieldsOpen(false)}
        templateModelId={routeModelId}
        documents={documents
          .filter((doc) => doc.labeling_document.status === "extracted")
          .map((doc) => ({
            id: doc.labeling_document_id,
            name: doc.labeling_document.original_filename,
          }))}
        onAddFields={async (fields) => {
          await addFieldsAsync(fields);
        }}
        onFieldsAdded={handleFieldsAdded}
      />
```

- [ ] **Step 6: Run the tests, lint and type-check**

Run: `cd apps/frontend && npx vitest run src/features/annotation`
Expected: PASS.

Run: `cd apps/frontend && npm run lint && npm run type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/annotation/template-models/components/SuggestFieldsModal.tsx \
  apps/frontend/src/features/annotation/template-models/components/SuggestFieldsModal.test.tsx \
  apps/frontend/src/features/annotation/template-models/pages/ModelDetailPage.tsx
git commit -m "feat(frontend): suggest a template model's fields from a document

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Documentation and end-to-end check

**Files:**
- Modify: `docs-md/architecture/TEMPLATE_MODELS.md`
- Modify: wiki pages that describe labelling, via the `docs-sync` skill

- [ ] **Step 1: Update `docs-md/architecture/TEMPLATE_MODELS.md`**

Make these edits:

1. **Backend module tree.** Replace the line `  suggestion.service.ts               # Auto-suggestion for labeling` with:

```
  label-suggestions/
    tagged-text.ts                    # Stored OCR rendered as text with line, cell and checkbox tags
    resolve-refs.ts                   # LLM tag references back to OCR element ids
    suggestion-llm.ts                 # Azure OpenAI call with a strict reply schema
    prompts.ts                        # Suggested-field and suggested-label prompts and reply schemas
    label-suggestion.service.ts       # Suggested fields and suggested labels
```

   In the `dto/` list, add `    field-suggestion.dto.ts` after `    field-definition.dto.ts`.

2. **Field Schema endpoint table.** Add these rows after the `POST … /fields` row:

```
| POST | `/api/template-models/:id/fields/bulk` | Add several fields in one transaction (409 lists keys that exist or repeat) |
| POST | `/api/template-models/:id/field-suggestions` | Suggest a field list from one document (body `{ document_id }`) |
```

3. **Documents & Labels table.** Replace the suggestions row with:

```
| POST | `/api/template-models/:id/documents/:docId/suggestions` | Suggested labels for a document (LLM) |
```

4. **Database schema section.** Add this bullet to "Key constraints":

```
- `FieldDefinition.description` (optional) is plain-English instructions used by label suggestions; it is not exported to training files
```

5. **Frontend file structure.** Replace `    useSuggestions.ts        # Auto-suggestions` with:

```
    useSuggestions.ts        # Suggested labels for the labelling screen
    useFieldSuggestions.ts   # Suggested fields from a document
```

   Add `    SuggestFieldsModal.tsx   # Suggest fields: pick a document, review, add` to `components/`.

6. **New section.** Add it before `## Training Flow`:

````markdown
## Label Suggestions

Suggested fields and suggested labels come from an LLM reading a document's stored layout OCR. Nothing is stored: every request is a fresh call, and nothing becomes a label until the user saves.

1. **Tagged text.** `tagged-text.ts` copies `analyzeResult.content` in reading order and inserts `[L12]` at each line, `[T2 r3 c1]` at each table cell, and `[S4 ☒]` / `[S4 ☐]` in place of each checkbox. A line whose words all sit in table cells gets no tag of its own.
2. **LLM call.** `suggestion-llm.ts` calls the deployment named by `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` and `AZURE_OPENAI_API_VERSION` (default `2024-10-21`), the same settings as the workflow agent. It uses the Vercel AI SDK's structured output. The reply names tags plus the value's exact text, never positions.
3. **Resolution.** `resolve-refs.ts` finds that text among the tag's words and returns the element ids the labelling screen uses (`p{page}-w{index}`, `p{page}-sm{index}`). Anything that does not match is dropped, not guessed. Words already used by an earlier field are skipped.

**Suggest fields** (Field schema tab → Suggest fields) proposes keys, types, one-line descriptions and the value found on the chosen document. The user edits the list and adds it through the bulk endpoint. The labelling screen then drafts that document's labels like any other.

**Limits and errors:**

| Status | When |
|---|---|
| 422 | over 30 pages or 120,000 tagged characters, or no fields for label suggestions |
| 502 | the model call failed; the body carries a `reason` |
| 503 | settings missing; the body lists the missing setting names |

**Data handling:** suggestions send the document's OCR text to the configured Azure OpenAI deployment. Point the settings only at a deployment approved for the documents' classification.
````

- [ ] **Step 2: Sync the wiki**

Use the `docs-sync` skill's "update docs affected by code changes" workflow for this branch's changes. It checks `docs-md/wiki/` pages that describe labelling or template models, for example `system-overview.md`, and updates them to the new behaviour.

- [ ] **Step 3: Run every affected test suite**

Run: `cd apps/backend-services && npm test -- src/template-model src/hitl src/training`
Expected: PASS.

Run: `cd apps/frontend && npx vitest run src/features/annotation`
Expected: PASS.

Run: `cd apps/backend-services && npm run lint && npm run type-check` and `cd apps/frontend && npm run lint && npm run type-check`
Expected: no errors.

- [ ] **Step 4: Check it in the running app**

Start the whole stack (backend, frontend, Temporal worker, deno-runner) with the `run` skill.

1. Open a template model that has at least one uploaded document marked "OCR complete".
2. Go to Field schema → Suggest fields, pick the document, and click Suggest. Expected: a list of fields with values. If the Azure OpenAI settings are absent, the modal shows "Label suggestions are not configured".
3. Untick one field, rename another, and click "Add N fields". Expected: a "N fields added" notification with a button, and the new fields in the table, each with a description.
4. Click "Open the document to check its suggested labels". Expected: the labelling screen opens and highlights the suggested words and checkboxes for each field.
5. Click Save labels, reopen the document, and confirm the labels persisted.

- [ ] **Step 5: Commit**

```bash
git add docs-md/architecture/TEMPLATE_MODELS.md
# plus the wiki pages the docs-sync step changed
git commit -m "docs: label suggestions, suggested fields and field descriptions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
