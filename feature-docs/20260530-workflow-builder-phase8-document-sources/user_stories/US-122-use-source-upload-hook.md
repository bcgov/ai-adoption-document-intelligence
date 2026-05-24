# US-122: `useSourceUpload` TanStack mutation hook

**As a** Run-drawer / SourceUploadButton consumer,
**I want** a TanStack mutation hook wrapping `POST /sources/:id/upload`,
**So that** both the Run drawer's Dropzone (US-123) and the settings-panel "Test upload" button (US-124) consume the same client-side surface.

## Acceptance Criteria

- [ ] **Scenario 1**: Hook signature + invocation contract
    - **Given** `apps/frontend/src/features/workflow-builder/sources/useSourceUpload.ts` (new)
    - **When** read
    - **Then** it exports `useSourceUpload(workflowId: string, sourceNodeId: string): UseMutationResult<SourceUploadResponse, ApiError, File>` (TanStack v5 shape consistent with sibling hooks)
    - **And** invoking `mutateAsync(file)` performs a `POST` to `/api/workflows/${workflowId}/sources/${sourceNodeId}/upload` with `multipart/form-data` body containing the file under the part name `"file"`

- [ ] **Scenario 2**: Response shape — ctxKey-keyed dict
    - **Given** the same hook
    - **When** the backend returns `{ "myFile": "https://blob/.../abc" }`
    - **Then** the hook's `data` state is `{ "myFile": "https://blob/.../abc" }` (a `Record<string, string>` — the response key is dynamic per the source's configured ctxKey)
    - **And** a type alias `SourceUploadResponse = Record<string, string>` is exported alongside the hook

- [ ] **Scenario 3**: 4xx surfaces as a typed `ApiError`
    - **Given** the hook
    - **When** the backend returns 400 (e.g. MIME mismatch from US-114 Scenario 4) or 413 (oversized — US-114 Scenario 5)
    - **Then** the hook's `error` state holds an `ApiError` with `status` and `message` populated from the response body (matching the existing apps/frontend error-handling convention; reuse the existing api-client wrapper)
    - **And** `onError` callbacks on the mutation fire with the typed error

- [ ] **Scenario 4**: Frontend vitest coverage with MSW
    - **Given** `apps/frontend/src/features/workflow-builder/sources/useSourceUpload.test.ts` (new)
    - **When** the test runs with MSW intercepting the upload endpoint
    - **Then** happy-path returns the ctxKey-keyed shape and resolves the mutation
    - **And** 400 / 413 paths surface as `ApiError` with correct status + message
    - **And** existing api-client tests stay green

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/sources/useSourceUpload.ts` — new hook
- `apps/frontend/src/features/workflow-builder/sources/useSourceUpload.test.ts` — new test

## Technical notes

- Reuse the existing api-client wrapper from `apps/frontend/src/api/` (or wherever workflow hooks like `useWorkflowRunSpec`, `useStartWorkflowRun` live). The multipart body construction is just `new FormData(); body.append("file", file);` — the wrapper handles auth headers (`x-api-key` + IDIR session).
- DO NOT change the response shape from the wire shape — the hook returns the backend response verbatim. The consumers (Run drawer, settings panel) decide what to do with the ctxKey-keyed object.
- For Scenario 3, the existing `ApiError` shape from the workspace's api-client is the right error type. If the existing wrapper uses a different shape (e.g. a discriminated union), match it.
- This hook does NOT chain into `/runs`. The consumer chains them — keeping the upload endpoint and the run endpoint decoupled per DOCUMENT_SOURCES_DESIGN.md §4.3 + US-114 Scenario 6.
- Story lands BEFORE the consumers (US-123, US-124) so the hook exists when they need it. The hook by itself isn't visible to Alex.
