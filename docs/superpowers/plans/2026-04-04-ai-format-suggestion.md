# AI Format Suggestion & Content Recommendation Changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-driven "Suggest formats" action to the template model UI that proposes field_format specs from error patterns, and refine the existing OCR improvement pipeline to focus on residual content errors using confusion profiles instead of hardcoded rules.

**Architecture:** New `FormatSuggestionService` in the template-model module calls Azure OpenAI to analyze HITL/benchmark error data and propose format specs. The existing `AiRecommendationService` is updated to remove normalizeFields from its manifest and recommend confusion profiles instead of rule IDs. The AI prompt is simplified.

**Tech Stack:** NestJS, Azure OpenAI (existing pattern from AiRecommendationService), Mantine UI (frontend button + suggestion review), Jest

**Spec:** `docs/superpowers/specs/2026-04-04-field-format-engine-design.md` — Section 3 (AI Format Suggestion), Section 4 (AI Content Recommendation Changes)

**Part of:** This is Plan C of 3. Plan A covers Field Format Engine. Plan B covers Confusion Profiles.

**Depends on:** Plan A (field format engine must exist for suggested specs to be usable) and Plan B (confusion profiles must exist for the updated AI recommendation to reference them).

---

### Task 1: Format Suggestion Backend Service

**Files:**
- Create: `apps/backend-services/src/template-model/format-suggestion.service.ts`
- Create: `apps/backend-services/src/template-model/format-suggestion.service.spec.ts`

- [ ] **Step 1: Write failing test for data gathering**

```typescript
// apps/backend-services/src/template-model/format-suggestion.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { FormatSuggestionService } from "./format-suggestion.service";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

describe("FormatSuggestionService", () => {
  let service: FormatSuggestionService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let httpService: { post: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      templateModel: {
        findUnique: jest.fn(),
      },
      fieldCorrection: {
        findMany: jest.fn(),
      },
      benchmarkRun: {
        findMany: jest.fn(),
      },
    };

    httpService = { post: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          AZURE_OPENAI_ENDPOINT: "https://test.openai.azure.com",
          AZURE_OPENAI_API_KEY: "test-key",
          AZURE_OPENAI_DEPLOYMENT: "test-deploy",
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormatSuggestionService,
        { provide: PrismaService, useValue: prisma },
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(FormatSuggestionService);
  });

  describe("gatherErrorData", () => {
    it("gathers HITL corrections for template model fields", async () => {
      prisma.templateModel.findUnique.mockResolvedValue({
        id: "tm-1",
        field_schema: [
          { field_key: "sin", field_type: "string", field_format: null },
          { field_key: "phone", field_type: "string", field_format: null },
        ],
      });

      prisma.fieldCorrection.findMany.mockResolvedValue([
        {
          field_key: "sin",
          original_value: "872 318 748",
          corrected_value: "872318748",
          action: "corrected",
        },
      ]);

      const data = await service.gatherErrorData("tm-1");
      expect(data.fieldDefinitions).toHaveLength(2);
      expect(data.corrections).toHaveLength(1);
      expect(prisma.fieldCorrection.findMany).toHaveBeenCalled();
    });
  });

  describe("suggestFormats", () => {
    it("calls Azure OpenAI and returns parsed suggestions", async () => {
      prisma.templateModel.findUnique.mockResolvedValue({
        id: "tm-1",
        field_schema: [
          { field_key: "sin", field_type: "string", field_format: null },
        ],
      });
      prisma.fieldCorrection.findMany.mockResolvedValue([
        {
          field_key: "sin",
          original_value: "872 318 748",
          corrected_value: "872318748",
          action: "corrected",
        },
      ]);

      const aiResponse = JSON.stringify([
        {
          fieldKey: "sin",
          formatSpec: { canonicalize: "digits", pattern: "^\\d{9}$" },
          rationale: "All corrections strip non-digit characters from 9-digit values",
        },
      ]);

      httpService.post.mockReturnValue({
        toPromise: () =>
          Promise.resolve({
            data: {
              choices: [{ message: { content: aiResponse } }],
              usage: { total_tokens: 100 },
            },
          }),
        pipe: jest.fn().mockReturnThis(),
        subscribe: jest.fn(),
      });

      // Mock firstValueFrom behavior
      jest.mock("rxjs", () => ({
        ...jest.requireActual("rxjs"),
        firstValueFrom: jest.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: aiResponse } }],
            usage: { total_tokens: 100 },
          },
        }),
      }));

      const suggestions = await service.suggestFormats("tm-1");
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].fieldKey).toBe("sin");
      expect(suggestions[0].formatSpec.canonicalize).toBe("digits");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend-services && npx jest format-suggestion --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FormatSuggestionService**

```typescript
// apps/backend-services/src/template-model/format-suggestion.service.ts
import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";

const CANONICALIZE_OPERATIONS = [
  { name: "digits", description: "Strip everything except digits" },
  { name: "uppercase", description: "Convert to uppercase" },
  { name: "lowercase", description: "Convert to lowercase" },
  { name: "strip-spaces", description: "Remove all whitespace" },
  { name: "text", description: "Collapse whitespace, trim, remove space before punctuation" },
  { name: "number", description: "Strip currency symbols, commas, spaces; normalize to numeric string" },
  { name: "date:FORMAT", description: "Parse any date format, output as FORMAT (e.g., date:YYYY-MM-DD)" },
  { name: "noop", description: "Pass through unchanged" },
];

export interface FormatSuggestion {
  fieldKey: string;
  formatSpec: { canonicalize: string; pattern?: string; displayTemplate?: string };
  rationale: string;
}

interface ErrorDataResult {
  fieldDefinitions: Array<{
    field_key: string;
    field_type: string;
    field_format: string | null;
  }>;
  corrections: Array<{
    field_key: string;
    original_value: string;
    corrected_value: string;
  }>;
  totalCorrections: number;
}

@Injectable()
export class FormatSuggestionService {
  private readonly logger = new Logger(FormatSuggestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async gatherErrorData(templateModelId: string): Promise<ErrorDataResult> {
    const tm = await this.prisma.templateModel.findUnique({
      where: { id: templateModelId },
      include: { field_schema: { orderBy: { display_order: "asc" } } },
    });

    if (!tm) throw new Error(`Template model ${templateModelId} not found`);

    const fieldKeys = tm.field_schema.map((f) => f.field_key);

    // Gather HITL corrections for fields in this template model
    const corrections = await this.prisma.fieldCorrection.findMany({
      where: {
        field_key: { in: fieldKeys },
        action: "corrected",
        original_value: { not: null },
        corrected_value: { not: null },
      },
      select: {
        field_key: true,
        original_value: true,
        corrected_value: true,
      },
      take: 10000,
    });

    const totalCorrections = corrections.length;
    const sampled = corrections.slice(0, 200);

    return {
      fieldDefinitions: tm.field_schema.map((f) => ({
        field_key: f.field_key,
        field_type: String(f.field_type),
        field_format: f.field_format,
      })),
      corrections: sampled.map((c) => ({
        field_key: c.field_key,
        original_value: c.original_value!,
        corrected_value: c.corrected_value!,
      })),
      totalCorrections,
    };
  }

  async suggestFormats(templateModelId: string): Promise<FormatSuggestion[]> {
    const errorData = await this.gatherErrorData(templateModelId);

    if (errorData.corrections.length === 0) {
      this.logger.log("No correction data available for format suggestion");
      return [];
    }

    const endpoint = this.configService.get<string>("AZURE_OPENAI_ENDPOINT");
    const apiKey = this.configService.get<string>("AZURE_OPENAI_API_KEY");
    const deployment = this.configService.get<string>("AZURE_OPENAI_DEPLOYMENT");

    if (!endpoint || !apiKey || !deployment) {
      throw new Error("Azure OpenAI configuration missing");
    }

    const apiVersion =
      this.configService.get<string>("AZURE_OPENAI_API_VERSION") ?? "2024-12-01-preview";
    const base = endpoint.replace(/\/$/, "");
    const url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`;

    const systemMessage = `You are an expert at analyzing OCR error patterns and recommending field format specifications.
You must respond with valid JSON only. Do not use markdown code fences or any text outside the JSON.`;

    const userMessage = `Field definitions for this template model:
${JSON.stringify(errorData.fieldDefinitions, null, 2)}

HITL corrections (${errorData.totalCorrections} total, up to 200 shown):
${JSON.stringify(errorData.corrections, null, 2)}

Available canonicalize operations (can be chained with |):
${JSON.stringify(CANONICALIZE_OPERATIONS, null, 2)}

Format spec structure:
- canonicalize (required): operation name or chain like "uppercase|strip-spaces"
- pattern (optional): regex to validate the canonicalized value
- displayTemplate (optional): output formatting with # for digits, A for letters

Analyze the correction patterns per field. For each field where you can identify a consistent format pattern, suggest a format spec.

Skip fields that:
- Already have a field_format defined
- Don't have enough corrections to identify a pattern
- Are free-text fields where no consistent format exists

Respond with a JSON array:
[
  {
    "fieldKey": "field_name",
    "formatSpec": { "canonicalize": "...", "pattern": "...", "displayTemplate": "..." },
    "rationale": "Brief explanation of the pattern observed"
  }
]

Return an empty array [] if no suggestions can be made.`;

    const payload = {
      messages: [
        { role: "system" as const, content: systemMessage },
        { role: "user" as const, content: userMessage },
      ],
      response_format: { type: "json_object" as const },
      max_completion_tokens: 4096,
    };

    const response = await firstValueFrom(
      this.httpService.post(url, payload, {
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        timeout: 120000,
      }),
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Azure OpenAI response missing content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      this.logger.warn("AI format suggestion response was not valid JSON");
      return [];
    }

    // Handle both array and object-with-array responses
    const suggestions = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>).suggestions)
        ? (parsed as Record<string, unknown>).suggestions
        : [];

    return (suggestions as Array<Record<string, unknown>>)
      .filter(
        (s) =>
          typeof s.fieldKey === "string" &&
          s.formatSpec &&
          typeof (s.formatSpec as Record<string, unknown>).canonicalize === "string",
      )
      .map((s) => ({
        fieldKey: s.fieldKey as string,
        formatSpec: s.formatSpec as FormatSuggestion["formatSpec"],
        rationale: (s.rationale as string) ?? "",
      }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend-services && npx jest format-suggestion --no-coverage`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/template-model/format-suggestion.service.ts apps/backend-services/src/template-model/format-suggestion.service.spec.ts
git commit -m "feat: add FormatSuggestionService for AI-driven format spec suggestions

Gathers HITL corrections for template model fields, calls Azure OpenAI
to analyze patterns, returns suggested field_format specs with rationale."
```

---

### Task 2: Format Suggestion API Endpoint

**Files:**
- Modify: `apps/backend-services/src/template-model/template-model.controller.ts`
- Create: `apps/backend-services/src/template-model/dto/format-suggestion.dto.ts`
- Modify: `apps/backend-services/src/template-model/template-model.module.ts`

- [ ] **Step 1: Create response DTO**

```typescript
// apps/backend-services/src/template-model/dto/format-suggestion.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FormatSpecDto {
  @ApiProperty() canonicalize: string;
  @ApiPropertyOptional() pattern?: string;
  @ApiPropertyOptional() displayTemplate?: string;
}

export class FormatSuggestionResponseDto {
  @ApiProperty() fieldKey: string;
  @ApiProperty({ type: FormatSpecDto }) formatSpec: FormatSpecDto;
  @ApiProperty() rationale: string;
}
```

- [ ] **Step 2: Add endpoint to template model controller**

Read the current controller to find the right pattern, then add:

```typescript
@Post(":id/suggest-formats")
@ApiOkResponse({
  description: "AI-suggested format specs for fields",
  type: [FormatSuggestionResponseDto],
})
async suggestFormats(@Param("id") templateModelId: string) {
  return this.formatSuggestionService.suggestFormats(templateModelId);
}
```

- [ ] **Step 3: Register FormatSuggestionService in module**

Add `FormatSuggestionService` to the template-model module providers and import `HttpModule`.

- [ ] **Step 4: Run backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/template-model/
git commit -m "feat: add POST /template-models/:id/suggest-formats endpoint

Returns AI-suggested field_format specs based on HITL correction patterns.
Operator reviews and applies suggestions through the template model UI."
```

---

### Task 3: Frontend — "Suggest Formats" Button + Review UI

**Files:**
- Modify: `apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.tsx` (or parent page)
- This task depends on the template model page structure — the engineer should read the template model detail page to find where to add the button.

- [ ] **Step 1: Read template model detail page**

Find the page that shows the template model with its field definitions list. This is where the "Suggest formats" button goes.

- [ ] **Step 2: Add "Suggest Formats" button and API call**

Add a button that calls `POST /api/template-models/:id/suggest-formats`. On success, display the suggestions in a reviewable list (modal or inline panel):

- Each suggestion shows: field key, proposed format spec (canonicalize, pattern, displayTemplate), rationale
- Each row has Accept / Edit / Reject actions
- "Accept" saves the format spec to the field definition via the existing update API
- "Edit" opens the FieldSchemaEditor pre-populated with the suggested values
- "Reject" dismisses the suggestion

Use Mantine components: `Button` for trigger, `Modal` or `Paper` for the suggestions list, `Table` for the rows, `ActionIcon` or `Button` for accept/reject.

- [ ] **Step 3: Handle loading and empty states**

- Loading: show `Loader` while AI call is in progress (can take 10-30 seconds)
- Empty: "No format suggestions could be generated. Ensure there is enough HITL correction data."
- Error: show `Notification` with error message

- [ ] **Step 4: Verify in browser**

Run frontend dev server, navigate to a template model with fields that have HITL corrections, click "Suggest Formats", verify suggestions appear and can be accepted.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/annotation/template-models/
git commit -m "feat: add 'Suggest Formats' button to template model UI

Calls AI format suggestion endpoint, displays suggestions in a
reviewable list. Operator can accept, edit, or reject each suggestion."
```

---

### Task 4: Update AI Content Recommendation — Remove normalizeFields from Manifest

**Files:**
- Modify: `apps/backend-services/src/hitl/tool-manifest.service.ts`
- Modify: `apps/backend-services/src/benchmark/ai-recommendation.service.ts`
- Modify: `apps/backend-services/src/benchmark/ai-recommendation.service.spec.ts`

- [ ] **Step 1: Read current tool manifest and AI recommendation service**

Read both files to understand the current structure.

- [ ] **Step 2: Update tool manifest — separate AI-recommended tools from all tools**

The tool manifest currently serves two purposes: listing tools for the workflow editor and listing tools for AI recommendation. Add a method or flag to distinguish:

```typescript
// In ToolManifestService, add:
getAiRecommendableTools(): ToolManifestEntry[] {
  // Return only ocr.characterConfusion and ocr.spellcheck
  // normalizeFields is now a built-in pipeline step, not AI-recommended
  return this.getManifest().filter(
    (t) => t.toolId !== "ocr.normalizeFields",
  );
}
```

- [ ] **Step 3: Update AI recommendation prompt**

In `apps/backend-services/src/benchmark/ai-recommendation.service.ts`:

1. Remove `normalizeFields` from `OCR_AI_CORRECTION_TOOL_ORDER` and `MODEL_JSON_KEYS`
2. Update `KEY_TO_TOOL_ID` accordingly
3. Update `buildUserMessage` to reference confusion profiles instead of rule IDs:

```typescript
const OCR_AI_CORRECTION_TOOL_ORDER = [
  "ocr.characterConfusion",
  "ocr.spellcheck",
] as const;

const MODEL_JSON_KEYS = [
  "characterConfusion",
  "spellcheck",
] as const;
```

Update the prompt rules section:
- Remove all references to `normalizeFields`, `emptyValueCoercion`, `disabledRules`, `slashToOne`
- Add: "For ocr.characterConfusion, recommend a confusionProfileId from available profiles"
- Add available confusion profiles to the prompt context

4. Update the pipeline service to pass available confusion profiles to the AI input.

- [ ] **Step 4: Update tests**

Update `apps/backend-services/src/benchmark/ai-recommendation.service.spec.ts`:
- Remove test cases that expect `normalizeFields` in recommendations
- Add test cases for confusion profile selection in character confusion params
- Update expected prompt format

- [ ] **Step 5: Run tests**

Run: `cd apps/backend-services && npx jest ai-recommendation --no-coverage`
Expected: ALL PASS

- [ ] **Step 6: Update OCR improvement pipeline service**

In `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`:
- Use `getAiRecommendableTools()` instead of `getManifest()` when building AI input
- Load available confusion profiles and pass them to the AI recommendation input

- [ ] **Step 7: Run full backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend-services/src/hitl/tool-manifest.service.ts apps/backend-services/src/benchmark/ai-recommendation.service.ts apps/backend-services/src/benchmark/ai-recommendation.service.spec.ts apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts
git commit -m "feat: update AI recommendation to use confusion profiles

Remove normalizeFields from AI-recommended tools (now a built-in step).
AI recommends confusion profile + threshold for character confusion,
and spellcheck config. Prompt simplified."
```

---

### Task 5: Full Test Suite + End-to-End Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 2: Run all temporal tests**

Run: `cd apps/temporal && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 3: Run frontend tests**

Run: `cd apps/frontend && npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: End-to-end verification**

1. Set up field_format specs on a template model (using Plan A's format spec editor)
2. Create a confusion profile from HITL data (using Plan B's derive endpoint)
3. Click "Suggest Formats" on a template model — verify AI suggestions appear
4. Run the OCR improvement pipeline — verify it only recommends character confusion + spellcheck (no normalizeFields)
5. Verify the candidate workflow uses the confusion profile

- [ ] **Step 5: Commit any adjustments**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification"
```
