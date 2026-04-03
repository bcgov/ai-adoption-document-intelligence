# US-010: Workflow modification utility (graph config + recommendation → new graph)

**As a** pipeline or activity,
**I want to** have a workflow modification utility that takes the current graph config and the AI recommendation (tools + placement + parameters) and returns a new graph config (and optionally persists a new workflow version),
**So that** a candidate workflow can be produced without manually editing the DAG.

## Acceptance Criteria
- [ ] **Scenario 1**: Inputs and output
    - **Given** a current GraphWorkflowConfig and a structured recommendation (list of tools, placement, parameters)
    - **When** the utility runs
    - **Then** it returns a new GraphWorkflowConfig with the recommended nodes inserted and edges/ports wired correctly

- [ ] **Scenario 2**: DAG semantics preserved
    - **Given** the utility inserts a node (e.g. a correction activity) on a chosen normal edge (e.g. immediately downstream of `azureOcr.extract` for Feature 008 candidates)
    - **When** the new graph is produced
    - **Then** the DAG is valid: the chosen edge is split, the new node is added with correct input/output port bindings, and ctx declarations are updated if needed

- [ ] **Scenario 3**: Constraints and behavior documented
    - **Given** the utility is implemented
    - **When** a developer uses or extends it
    - **Then** supported insertion points (or recommendation shapes) and handling of port bindings are documented; scope may be limited in the first iteration

- [ ] **Scenario 4**: No placeholders
    - **Given** the utility is delivered
    - **When** it is used
    - **Then** it is a real implementation (no stubs); partial implementations are acceptable only if scope is explicitly limited and documented

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 4; requirements Section 6. Non-trivial: edge splitting, new node id, two new edges, port bindings. Reference: graph-workflow-types.ts (GraphWorkflowConfig, nodes, edges, ctx).
- **Multiple recommendations between the same pair of anchor nodes:** If the direct edge between `afterNodeId` and `beforeNodeId` was already split by a prior insertion, the utility finds the **last normal edge** on a path toward `beforeNodeId` and splits that so new nodes chain in order. Implemented in `applyRecommendations` — `apps/temporal/src/workflow-modification/workflow-modification.util.ts` (backend: `apps/backend-services/src/workflow/workflow-modification.util.ts`).
- **Feature 008 candidates:** only **`ocr.characterConfusion`**, **`ocr.normalizeFields`**, and **`ocr.spellcheck`** are inserted; they use the generic `ocrResult` port binding on the anchor edge. **`ocr.enrich`** is **not** inserted by the improvement pipeline. Manually authored **`ocr.enrich`** nodes follow the activity contract in [docs-md/ENRICHMENT.md](../../../docs-md/ENRICHMENT.md) (including optional `llmPromptAppend` when LLM enrichment is enabled).
