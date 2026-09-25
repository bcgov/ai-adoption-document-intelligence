# US-159: Signature semantics validation + derived `ActivityCatalogEntry` assembly

**As a** backend engineer extending the parser,
**I want** the parser to validate signature semantics (kind registry, slug regex, parameters shape) and assemble the derived `ActivityCatalogEntry`,
**So that** downstream consumers receive either a fully-formed catalog entry OR a precise list of semantic errors with targeted field tags for the agent's revision loop.

## Acceptance Criteria

- [x] **Scenario 1**: Slug validation against `/^[a-z][a-z0-9-]*$/` max 64 chars
    - **Given** a script whose `@name` does NOT match the regex (e.g. `My-Node`, `_my-node`, 65+ chars)
    - **When** parsed
    - **Then** the parser emits `{ stage: "signature-semantics", message: "@name must match /^[a-z][a-z0-9-]*$/ max 64 chars", tag: "@name", line }`
    - **And** `entry` is `null` in the result

- [x] **Scenario 2**: Kind registry check for every input + output port
    - **Given** a script declaring `@inputs { foo: { kind: "Document" } }` and `@outputs { bar: { kind: "NotARealKind" } }`
    - **When** parsed
    - **Then** the `Document` input passes; the unknown-kind output emits `{ stage: "signature-semantics", message: "Unknown kind: NotARealKind", tag: "@outputs", unknownKind: "NotARealKind" }`
    - **And** array kinds (e.g. `"Segment[]"`) resolve via the existing Phase 3 registry helpers

- [x] **Scenario 3**: `@parameters` shape coerces to JSON Schema 7
    - **Given** a script declaring `@parameters { minConfidence: { type: "number", default: 0.5, min: 0, max: 1 } }`
    - **When** parsed
    - **Then** the parser produces `paramsSchema = { type: "object", properties: { minConfidence: { type: "number", default: 0.5, minimum: 0, maximum: 1 } }, required: [], additionalProperties: false }`
    - **And** malformed parameter shapes (e.g. `type: "uuid"` — not supported) emit `{ stage: "signature-semantics", message, tag: "@parameters" }`

- [x] **Scenario 4**: Caps and defaults applied to numeric tags
    - **Given** a script with `@timeoutMs 999999` and no `@maxMemoryMB`
    - **When** parsed
    - **Then** the parser caps `timeoutMs` at 60000 and defaults `maxMemoryMB` to 256 (Phase 6.0 hardcoded ceilings)
    - **And** the cap event itself is NOT an error (silent clamp); explicit user-overflow gets a future story in 6.x

- [x] **Scenario 5**: Derived `ActivityCatalogEntry` assembled on success
    - **Given** a fully valid script
    - **When** parsed
    - **Then** the result is `{ entry: ActivityCatalogEntry, errors: [] }` where `entry` carries: `type: "dyn.<slug>"`, `category`, `description`, `iconHint: "code"`, `colorHint: "dyn"`, `nonCacheable: !deterministic`, `paramsSchema`, `inputs: PortDescriptor[]`, `outputs: PortDescriptor[]`, `dynamicNodeSlug: <slug>`, `dynamicNodeVersion: 0` (placeholder; backend overwrites), `allowNet`
    - **And** the entry's input/output `PortDescriptor`s carry `kind` declarations compatible with Phase 3's bulk-catalog invariant test

- [x] **Scenario 6**: Unit tests cover every semantics path
    - **Given** the parser test suite
    - **When** the suite runs
    - **Then** it covers: slug-regex failures, unknown-kind failures (input + output), malformed parameters, default application, silent cap on timeouts/memory, full happy path entry shape, and integration where US-158's jsdoc-parse failure short-circuits before semantics runs

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/dynamic-nodes/parse-signature.ts` — extend with semantics stage
- `packages/graph-workflow/src/dynamic-nodes/parse-signature.test.ts` — extend with semantics scenarios

## Technical notes

- This story closes the parser. After US-159, `parseDynamicNodeSignature` is feature-complete — it covers stages `jsdoc-parse` and `signature-semantics`. Stages `ts-check` and `allowlist` are backend-only (US-164) since they require running Deno + reading the global allowlist env var.
- The Phase 3 `ArtifactKind` registry is already exported from `packages/graph-workflow/src/catalog/types.ts` (or equivalent). Reuse the existing kind-resolution helper.
- `entry.dynamicNodeVersion: 0` is a placeholder. The backend overwrites it with the real version number after persisting (`POST` → 1, `PUT` → N+1).
- After landing: no Vite restart needed yet — US-161 closes the package with new exports.
