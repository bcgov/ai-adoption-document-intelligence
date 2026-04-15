# US-001: Define TransformNode TypeScript Interface

**As a** developer,
**I want to** add a `TransformNode` TypeScript interface and update the `NodeType` union across all three apps (backend-services, temporal, frontend),
**So that** the type system recognises the data transformation node and downstream code can reference it with full type safety.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: NodeType union extended in all three apps
    - **Given** the `NodeType` union is defined identically in `apps/backend-services/src/workflow/graph-workflow-types.ts`, `apps/temporal/src/graph-workflow-types.ts`, and `apps/frontend/src/types/graph-workflow.ts`
    - **When** the `"transform"` literal is added to each file
    - **Then** all three files include `"transform"` in the `NodeType` union and TypeScript compilation passes

- [ ] **Scenario 2**: TransformNode interface has required format fields
    - **Given** a new `TransformNode` interface is added to all three type files
    - **When** inspecting the interface
    - **Then** it extends `GraphNodeBase` and contains `inputFormat: "json" | "xml" | "csv"` and `outputFormat: "json" | "xml" | "csv"`

- [ ] **Scenario 3**: TransformNode interface has the fieldMapping field
    - **Given** the `TransformNode` interface definition
    - **When** inspecting the interface
    - **Then** it contains `fieldMapping: string` representing the JSON field-mapping document as a serialised string

- [ ] **Scenario 4**: TransformNode interface has optional xmlEnvelope field
    - **Given** the `TransformNode` interface definition
    - **When** inspecting the interface
    - **Then** it contains `xmlEnvelope?: string` as an optional field for the XML envelope template

- [ ] **Scenario 5**: GraphNode discriminated union includes TransformNode
    - **Given** the `GraphNode` type alias in all three apps
    - **When** `TransformNode` is added to the union
    - **Then** the discriminated union correctly narrows to `TransformNode` when `node.type === "transform"` in all three apps

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The `TransformNode` interface must be added identically (or equivalently) to all three type files: `apps/backend-services/src/workflow/graph-workflow-types.ts`, `apps/temporal/src/graph-workflow-types.ts`, and `apps/frontend/src/types/graph-workflow.ts`.
- `fieldMapping` is stored as a raw JSON string (not a parsed object) to allow the editor to preserve formatting and allow invalid-JSON intermediate states.
- The `xmlEnvelope` field holds the raw XML envelope template string; its validity is checked at execution time.
- No migration is required — no database schema change; node configs are stored as JSONB and the new type is additive.
