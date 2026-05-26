# US-199: Graph-editing write tools — `addNode` + `setNodeParameters` + `connectNodes` + `deleteNode` + `setEntryNode`

**As a** backend engineer giving the agent fine-grained graph authoring,
**I want** five graph-editing tools that each apply a typed partial change to a workflow's `config` via read-modify-write,
**So that** the agent produces structured tool-call history in the chat rather than opaque JSON dumps.

## Acceptance Criteria

- [ ] **Scenario 1**: `addNode` tool inserts a node + persists via existing `WorkflowsService.update`
    - **Given** the tool registered in `workflow.tools.ts`
    - **When** the handler runs with `{ workflowId, node: { id, type, name?, parameters?, position? } }`
    - **Then** it reads the workflow, merges the node into `config.nodes` (rejects duplicate id with `{ ok: false, error: { code: 'duplicate-node-id' } }`), writes back via `WorkflowsService.update`
    - **And** any Phase 1 validator error surfaces as `{ ok: false, error: { code: 'validation', message, body: { errors } } }`

- [ ] **Scenario 2**: `setNodeParameters` tool patches a single node's parameters
    - **Given** the tool registered
    - **When** called with `{ workflowId, nodeId, parameters }`
    - **Then** the handler reads the workflow, finds the node by id, replaces its `parameters` (deep replace, not merge), writes back
    - **And** returns `{ ok: false, error: { code: 'not-found' } }` if `nodeId` doesn't exist

- [ ] **Scenario 3**: `connectNodes` tool adds edges + optional input binding
    - **Given** the tool registered
    - **When** called with `{ workflowId, sourceNodeId, targetNodeId, port?, binding?: { port, ctxKey } }`
    - **Then** the handler adds an edge `{ source: sourceNodeId, target: targetNodeId, sourcePort?, targetPort? }` to `config.edges`
    - **And** if `binding` is provided, adds it to the target node's `inputBindings`
    - **And** Phase 3 binding-walk errors propagate VERBATIM into `error.body.errors` so the agent reads the same wording a human would see

- [ ] **Scenario 4**: `deleteNode` tool cascades edges + bindings
    - **Given** the tool registered
    - **When** called with `{ workflowId, nodeId }`
    - **Then** the handler removes the node from `config.nodes` + removes every edge with that node as source OR target + removes every input binding on remaining nodes that references a ctx key produced by the deleted node
    - **And** if the deleted node was `entryNodeId`, clears `entryNodeId` (null)
    - **And** writes back; validator errors propagate

- [ ] **Scenario 5**: `setEntryNode` tool + unit tests for all five
    - **Given** `setEntryNode` registered + extended `workflow.tools.spec.ts`
    - **When** called with `{ workflowId, nodeId: string | null }`
    - **Then** the handler sets `config.entryNodeId` and writes back
    - **And** unit tests cover: addNode happy path, addNode duplicate-id rejection, setNodeParameters not-found, connectNodes with binding triggers binding-walk error, deleteNode cascades to edges + bindings + entryNodeId, setEntryNode to a valid node, setEntryNode to null

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/workflow.tools.ts` — extend with five graph-editing tools
- `apps/backend-services/src/agent/tools/workflow.tools.spec.ts` — extend

## Technical notes

- Per L13 + L36 in REQUIREMENTS.md.
- Each tool is a small read-modify-write helper; no new backend service methods needed (`WorkflowsService.update` already covers the whole-workflow PUT path).
- Validator runs as part of the existing update path — these tools don't re-implement validation, they just translate validator errors into the tool-result shape.
- Concurrent edits are last-write-wins per L51 — no locking attempted.
