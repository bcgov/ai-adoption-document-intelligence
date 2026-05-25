# US-160: Ambient `@ai-di/graph-workflow/kinds` subpath export

**As a** dynamic-node author (human OR Phase 7 agent),
**I want** to `import type { Document, Segment, OcrResult, Classification } from "@ai-di/graph-workflow/kinds"` in my TypeScript script,
**So that** my function parameters are typed and `deno check` at publish time catches type mismatches between my JSDoc kind declarations and my function signature.

## Acceptance Criteria

- [ ] **Scenario 1**: New `src/kinds/` directory with `index.ts`
    - **Given** the shared package
    - **When** `packages/graph-workflow/src/kinds/index.ts` is read after the change
    - **Then** it exports TS type aliases for every registered `ArtifactKind`: `Document`, `Segment`, `OcrResult`, `Classification`, `OcrTable`, `OcrFields`, `ValidationResult`, `Reference`, `Artifact`, `SinglePageDocument`, `MultiPageDocument`
    - **And** each alias is `Record<string, unknown>` with a phantom `__kind: "<KindName>"` brand for compile-time distinguishability

- [ ] **Scenario 2**: Array variants exported alongside scalar kinds
    - **Given** the same file
    - **When** read
    - **Then** array variants (`SegmentArray`, `OcrTableArray`, etc.) are exported as `<Kind>[]` aliases for ergonomic JSDoc references like `kind: "Segment[]"`
    - **And** TypeScript syntax `Segment[]` continues to work via standard array semantics

- [ ] **Scenario 3**: `package.json` exports map advertises the subpath
    - **Given** `packages/graph-workflow/package.json`
    - **When** read after the change
    - **Then** the `exports` map contains an entry `"./kinds": { "types": "./dist/kinds/index.d.ts", "import": "./dist/kinds/index.js", "default": "./dist/kinds/index.js" }`
    - **And** `tsconfig.json` `paths` mapping (if any) lets `@ai-di/graph-workflow/kinds` resolve in the monorepo workspace

- [ ] **Scenario 4**: `npm run build` in the package produces the subpath output
    - **Given** the package's build script
    - **When** `npm run build` runs
    - **Then** `dist/kinds/index.js` and `dist/kinds/index.d.ts` exist
    - **And** the `.d.ts` declares every alias the source `index.ts` declares

- [ ] **Scenario 5**: A sample dynamic-node script imports the kinds successfully
    - **Given** a script with `import type { Document } from "@ai-di/graph-workflow/kinds"` and a function parameter typed `ctx: { document: Document }`
    - **When** `deno check` runs against the script (with the shared package's `dist/kinds/index.d.ts` available)
    - **Then** the script type-checks cleanly with zero errors

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/kinds/index.ts` — new file (TS type aliases)
- `packages/graph-workflow/package.json` — extend `exports` map
- `packages/graph-workflow/tsconfig.json` — extend `paths` if needed

## Technical notes

- The kinds are runtime tags, not deep type-checked shapes — Model A keeps `ctx` as `Record<string, unknown>` at runtime. The aliases exist purely for the agent's compile-time feedback (`deno check`) and IDE autocomplete in Monaco. Don't try to mirror the full Phase 3 artifact shape in TS.
- The phantom `__kind` brand prevents accidentally assigning a `Document` to a `Segment` parameter even though both alias `Record<string, unknown>`. This is `nominal-typing-via-brand`, a standard TypeScript pattern.
- After landing: ask Alex to restart Vite if Vite pre-bundles `@ai-di/graph-workflow` (it does, per the workflow-builder handoff). The new subpath export changes the package's module graph.
