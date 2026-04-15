NOTE: The requirements document for this feature is available here: `feature-docs/010-data-transformation-node/REQUIREMENTS.md`.

All user story files are located in `feature-docs/010-data-transformation-node/user_stories/`.

Read both the requirements document and individual user story files for full implementation details.

After implementing a user story, check it off at the bottom of this file.

---

## Group 1: Foundation / Type System (US-001) — HIGH priority
| File | Title |
|---|---|
| `US-001-transform-node-type-definitions.md` | Define TransformNode TypeScript Interface |

## Group 2: Transformation Engine — Core (US-002 to US-006) — HIGH priority
| File | Title |
|---|---|
| `US-002-input-format-parsers.md` | Implement Input Format Parsers |
| `US-003-binding-expression-resolver.md` | Implement Binding Expression Resolver |
| `US-004-json-output-renderer.md` | Implement JSON Output Renderer |
| `US-005-xml-output-renderer.md` | Implement XML Output Renderer |
| `US-006-csv-output-renderer.md` | Implement CSV Output Renderer |

## Group 3: Transformation Engine — Advanced (US-007 to US-008) — HIGH priority
| File | Title |
|---|---|
| `US-007-xml-envelope-injection.md` | Implement XML Envelope Template Injection |
| `US-008-array-iteration-support.md` | Implement Array Iteration Support |

## Group 4: Error Handling (US-009 to US-010) — HIGH priority
| File | Title |
|---|---|
| `US-009-unresolved-binding-error-handling.md` | Unresolved Binding Error Handling |
| `US-010-malformed-output-error-handling.md` | Malformed Output Error Handling |

## Group 5: Node Execution & Validation (US-011) — HIGH priority
| File | Title |
|---|---|
| `US-011-execution-engine-registration.md` | Register Transform Node in Execution Engine and Validators |

## Group 6: Frontend — Node UI (US-012 to US-015) — MEDIUM priority
| File | Title |
|---|---|
| `US-012-workflow-builder-ui-registration.md` | Add Transform Node to Workflow Builder UI |
| `US-013-config-form-format-and-mapping.md` | Node Configuration Form — Format Selectors and Mapping Editor |
| `US-014-config-form-xml-envelope.md` | Node Configuration Form — XML Envelope Editor |
| `US-015-node-summary-view.md` | Transform Node Summary View |

---

## Suggested Implementation Order (by dependency chain)

### Phase 1 — Foundation
- [x] **US-001** (Define TransformNode TypeScript interface in all three apps) -- all other stories depend on this

### Phase 2 — Core Transformation Engine
- [x] **US-002** (Implement input format parsers: JSON/XML/CSV → intermediate JSON)
- [x] **US-003** (Implement binding expression resolver: `{{nodeName.field.path}}`)
- [x] **US-004** (Implement JSON output renderer)
- [x] **US-005** (Implement XML output renderer without envelope)
- [ ] **US-006** (Implement CSV output renderer)

### Phase 3 — Advanced Transformation Engine
- [ ] **US-007** (Implement XML envelope template injection)
- [ ] **US-008** (Implement array iteration support: `{{#each}}` / `{{/each}}`)

### Phase 4 — Error Handling
- [ ] **US-009** (Unresolved binding error handling — halt, log, non-retryable failure)
- [ ] **US-010** (Malformed output error handling — post-render validation for all formats)

### Phase 5 — Execution Registration
- [ ] **US-011** (Register transform node in node executor and both graph schema validators)

### Phase 6 — Frontend UI
- [ ] **US-012** (Add transform node to workflow builder palette and graph visualization)
- [ ] **US-013** (Node configuration form — format selectors and mapping editor)
- [ ] **US-014** (Node configuration form — XML envelope editor)
- [ ] **US-015** (Transform node summary/read-only view with error badge)

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
