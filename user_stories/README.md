NOTE: The requirements document for this feature is available here: `docs/DAG_WORKFLOW_ENGINE.md`.

All user stories files are located in `/home/alstruk/GitHub/ai-adoption-document-intelligence/user_stories/`.

## Foundation / Types (US-001 to US-003) -- HIGH priority
| File | Title |
|---|---|
| `US-001-graph-schema-typescript-types.md` | Define all TypeScript interfaces for the graph workflow config schema |
| `US-002-activity-registry.md` | Create the activity type registry mapping activity strings to implementations |
| `US-003-expression-evaluator.md` | Implement the structured operator DSL condition evaluator |

## Validation (US-004 to US-005) -- HIGH priority
| File | Title |
|---|---|
| `US-004-backend-graph-schema-validator.md` | Backend graph schema validator (save-time validation with 13 acceptance scenarios) |
| `US-005-temporal-graph-schema-validator.md` | Temporal worker graph schema validator (execution-time defensive check) |

## Graph Runner / Execution Engine (US-006 to US-014) -- HIGH/MEDIUM priority
| File | Title |
|---|---|
| `US-006-graph-runner-core-dag-execution.md` | Core DAG execution: topological sort, ready set, main loop, cancellation |
| `US-007-graph-runner-activity-node.md` | Activity node: port binding resolution, activity invocation, output writing |
| `US-008-graph-runner-switch-node.md` | Switch node: conditional branching with expression evaluation |
| `US-009-graph-runner-map-join-nodes.md` | Map/Join nodes: fan-out over collections with concurrency limits and fan-in collection |
| `US-010-graph-runner-polluntil-node.md` | PollUntil node: activity polling loop with interval, delay, and timeout |
| `US-011-graph-runner-humangate-node.md` | HumanGate node: signal-based approval with timeout policies |
| `US-012-graph-runner-child-workflow-node.md` | ChildWorkflow node: library and inline subgraph invocation |
| `US-013-graph-runner-error-policy.md` | Per-node error policies: fail, fallback edges, skip |
| `US-014-graph-runner-query-signal-handlers.md` | Query handlers (getStatus, getProgress) and signal handlers (cancel, dynamic signals) |

## Infrastructure (US-015 to US-016) -- HIGH/MEDIUM priority
| File | Title |
|---|---|
| `US-015-config-hash-and-versioning.md` | SHA-256 config hash computation and version management |
| `US-016-blob-storage-service.md` | Blob storage abstraction with local filesystem implementation |

## New Activities (US-017 to US-019) -- HIGH/MEDIUM priority
| File | Title |
|---|---|
| `US-017-document-split-activity.md` | PDF splitting activity using qpdf (per-page, fixed-range, boundary detection) |
| `US-018-document-classify-activity.md` | Rule-based document classification activity |
| `US-019-document-validate-fields-activity.md` | Cross-document field validation activity |

## Backend API (US-020 to US-022) -- HIGH priority
| File | Title |
|---|---|
| `US-020-backend-dto-and-workflow-types.md` | Updated DTOs and workflow type constants |
| `US-021-backend-start-graph-workflow.md` | Replace startOCRWorkflow with startGraphWorkflow |
| `US-022-backend-workflow-service-validation.md` | Wire new validator into workflow service |

## Frontend (US-023 to US-028) -- HIGH/LOW priority
| File | Title |
|---|---|
| `US-023-frontend-graph-workflow-types.md` | Frontend TypeScript type definitions |
| `US-024-frontend-json-editor-panel.md` | CodeMirror JSON editor with syntax highlighting and error markers |
| `US-025-frontend-react-flow-graph-visualization.md` | React Flow read-only graph visualization with auto-layout |
| `US-026-frontend-workflow-editor-page.md` | Combined create/edit page with split-panel layout and toolbar |
| `US-027-frontend-workflow-list-schema-version.md` | SchemaVersion badge column on list page |
| `US-028-frontend-api-hooks-and-routes.md` | Updated API hooks and route configuration |

## Integration and Cleanup (US-029 to US-031) -- HIGH/MEDIUM priority
| File | Title |
|---|---|
| `US-029-upload-flow-blob-reference.md` | Change upload flow from base64 to blob key references |
| `US-030-legacy-code-removal.md` | Remove all old workflow code, types, and files |
| `US-031-workflow-templates.md` | Seed standard OCR and multi-page report workflow templates |

## Suggested Implementation Order (by dependency chain)

### Phase 1
- [x] **US-001** (types) -- everything depends on this

### Phase 2
- [x] **US-002** (activity registry)
- [x] **US-003** (expression evaluator)
- [x] **US-016** (blob storage)

### Phase 3
- [x] **US-004** (backend validator)
- [x] **US-005** (temporal validator)

### Phase 4
- [ ] **US-006** (core runner)
- [ ] **US-007** (activity node)
- [ ] **US-008** (switch node)
- [ ] **US-009** (map/join nodes)
- [ ] **US-010** (pollUntil node)
- [ ] **US-011** (humanGate node)
- [ ] **US-012** (childWorkflow node)
- [ ] **US-013** (error policy)

### Phase 5
- [ ] **US-014** (query/signal handlers)
- [ ] **US-015** (versioning)

### Phase 6
- [ ] **US-017** (document split activity)
- [ ] **US-018** (document classify activity)
- [ ] **US-019** (document validate fields activity)

### Phase 7
- [ ] **US-020** (backend DTO and workflow types)
- [ ] **US-021** (start graph workflow)
- [ ] **US-022** (workflow service validation)

### Phase 8
- [ ] **US-023** (frontend types)
- [ ] **US-024** (JSON editor panel)
- [ ] **US-025** (React Flow visualization)
- [ ] **US-026** (workflow editor page)

### Phase 9
- [ ] **US-027** (workflow list schema version)
- [ ] **US-028** (API hooks and routes)

### Phase 10
- [ ] **US-029** (upload flow blob references)

### Phase 11
- [ ] **US-031** (workflow templates)

### Phase 12
- [ ] **US-030** (legacy code removal)
