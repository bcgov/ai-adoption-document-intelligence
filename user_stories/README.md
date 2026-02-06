# Summary: 31 User Stories Created

All files are located in `/home/alstruk/GitHub/ai-adoption-document-intelligence/user_stories/`.

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

1. **US-001** (types) -- everything depends on this
2. **US-002** (activity registry), **US-003** (expression evaluator), **US-016** (blob storage) -- parallel
3. **US-004** (backend validator), **US-005** (temporal validator)
4. **US-006** (core runner), then **US-007 through US-013** (node type handlers, can be partially parallelized)
5. **US-014** (query/signal handlers), **US-015** (versioning)
6. **US-017, US-018, US-019** (new activities) -- parallel
7. **US-020, US-021, US-022** (backend API updates) -- sequential
8. **US-023** (frontend types), then **US-024, US-025** (editor and visualization -- parallel), then **US-026** (editor page)
9. **US-027, US-028** (frontend list page and hooks)
10. **US-029** (upload flow change)
11. **US-031** (templates)
12. **US-030** (legacy removal -- last)
