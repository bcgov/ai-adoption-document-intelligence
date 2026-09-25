# US-157: Shared types + `ParseError` shape

**As a** backend + frontend engineer wiring the Phase 6 signature DSL,
**I want** shared TypeScript types for the parsed signature, version record, and structured parse errors,
**So that** every downstream consumer (publish endpoint, frontend signature-preview pane, Prisma JSON column type, Phase 7 agent) reads + writes the same shape with no `any` types.

## Acceptance Criteria

- [x] **Scenario 1**: New `packages/graph-workflow/src/dynamic-nodes/` directory + `types.ts` file
    - **Given** the shared package
    - **When** `packages/graph-workflow/src/dynamic-nodes/types.ts` is read after the change
    - **Then** it exports the interfaces `DynamicNodeSignature`, `DynamicNodeVersionRecord`, and `ParseError`
    - **And** the directory is wired into the package's `tsconfig` includes

- [x] **Scenario 2**: `DynamicNodeSignature` carries every field derivable from the JSDoc header
    - **Given** the type
    - **When** read
    - **Then** it contains: `name: string`, `description: string`, `category: string` (default `"Custom"`), `deterministic: boolean`, `inputs: DynamicNodePort[]`, `outputs: DynamicNodePort[]`, `paramsSchema: Record<string, unknown>` (JSON Schema 7), `allowNet: string[]`, `timeoutMs: number`, `maxMemoryMB: number`
    - **And** `DynamicNodePort` is `{ name: string; kind: string; required?: boolean; description?: string }`

- [x] **Scenario 3**: `DynamicNodeVersionRecord` matches the Prisma row shape
    - **Given** the type
    - **When** read
    - **Then** it contains: `versionNumber: number`, `script: string`, `signature: DynamicNodeSignature`, `allowNet: string[]`, `deterministic: boolean`, `publishedByUserId?: string`, `publishedAt: string` (ISO)

- [x] **Scenario 4**: `ParseError` is a discriminated union over the four publish-time stages
    - **Given** the type
    - **When** read
    - **Then** it has `stage: "jsdoc-parse" | "signature-semantics" | "ts-check" | "allowlist"` + `message: string`
    - **And** optional fields `line?: number`, `column?: number`, `tag?: string`, `unknownKind?: string`, `rejectedHost?: string` for the relevant stages

- [x] **Scenario 5**: Types are exported from the shared-package barrel
    - **Given** `packages/graph-workflow/src/index.ts`
    - **When** read
    - **Then** it re-exports `DynamicNodeSignature`, `DynamicNodeVersionRecord`, `ParseError`, `DynamicNodePort` from `./dynamic-nodes/types`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/dynamic-nodes/types.ts` — new file
- `packages/graph-workflow/src/index.ts` — barrel re-exports

## Technical notes

- No runtime code in this story — pure types. The Prisma model in US-162 declares `signature` as `Json`; TypeScript callers cast to `DynamicNodeSignature` after reading.
- This story unblocks US-158 (parser uses `ParseError` + `DynamicNodeSignature`).
- After landing: no Vite restart needed (types only).
