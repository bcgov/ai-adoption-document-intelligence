# US-016: Tighten `data.transform` catalog schema to match runtime contract

**As a** workflow author,
**I want** the catalog's `data.transform` parameter schema to reject the
same shapes the runtime would reject,
**So that** save-time and editor-time validation surface the failures
before a workflow is dispatched to Temporal.

## Acceptance Criteria

- [x] **Scenario 1**: `fieldMapping` must be a non-empty JSON-parseable string
    - **Given** the catalog `data.transform` schema
    - **When** parsing `{ inputFormat: "json", outputFormat: "json", fieldMapping: "not-json" }`
    - **Then** `safeParse` returns `success: false` with an issue whose path is `["fieldMapping"]` and whose message mentions valid JSON

- [x] **Scenario 2**: `fieldMapping: "{}"` is accepted
    - **Given** the catalog `data.transform` schema
    - **When** parsing `{ inputFormat: "json", outputFormat: "xml", fieldMapping: "{}" }`
    - **Then** `safeParse` returns `success: true`

- [x] **Scenario 3**: `xmlEnvelope` must contain exactly one `{{payload}}` placeholder when `outputFormat === "xml"`
    - **Given** the catalog `data.transform` schema
    - **When** parsing `{ inputFormat: "json", outputFormat: "xml", fieldMapping: "{}", xmlEnvelope: "<root></root>" }`
    - **Then** `safeParse` returns `success: false` with an issue whose path includes `xmlEnvelope` and whose message mentions `{{payload}}`

- [x] **Scenario 4**: `xmlEnvelope` placeholder rule is skipped for non-xml output
    - **Given** the catalog `data.transform` schema
    - **When** parsing `{ inputFormat: "json", outputFormat: "json", fieldMapping: "{}", xmlEnvelope: "<root></root>" }`
    - **Then** `safeParse` returns `success: true` (the envelope is dead weight but not invalid)

- [x] **Scenario 5**: Multiple `{{payload}}` placeholders are rejected
    - **Given** `outputFormat: "xml"` and `xmlEnvelope: "<a>{{payload}}</a><b>{{payload}}</b>"`
    - **When** parsing
    - **Then** `safeParse` returns `success: false` with an issue mentioning `{{payload}}`

- [x] **Scenario 6**: Valid envelope passes
    - **Given** `outputFormat: "xml"` and `xmlEnvelope: "<root>{{payload}}</root>"`
    - **When** parsing
    - **Then** `safeParse` returns `success: true`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Runtime contract is in `apps/temporal/src/activities/data-transform/execute.ts:105` (`JSON.parse(fieldMapping) as Record<string, unknown>`) and `apps/temporal/src/activities/data-transform/xml-envelope-injector.ts:1` (`const PAYLOAD_PLACEHOLDER = "{{payload}}";` with the "exactly one" assertion).
- Today's catalog schema in `packages/graph-workflow/src/catalog/activities/data-transform.ts` uses `z.union([z.string().min(1), z.record(z.string(), z.unknown())])` for `fieldMapping` — too permissive. The runtime ONLY accepts a string and calls `JSON.parse` on it.
- Use a `z.object({...}).superRefine(...)` (or `.refine(...)` on individual fields) to express the JSON-parseable + `{{payload}}` constraints. Keep the existing `.meta({ "x-widget": "field-mapping-editor" })` so the frontend renderer is undisturbed.

## Files modified

- `packages/graph-workflow/src/catalog/activities/data-transform.ts` — tighten `fieldMapping` to string-only with JSON-parse refinement; add cross-field `{{payload}}` refinement on the parent object.
- `packages/graph-workflow/src/catalog/activities/data-transform.test.ts` — NEW; covers the six scenarios above.
