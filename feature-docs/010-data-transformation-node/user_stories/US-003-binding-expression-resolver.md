# US-003: Implement Binding Expression Resolver

**As a** developer building the transformation engine,
**I want to** resolve `{{nodeName.field.path}}` binding expressions in the field mapping against the intermediate JSON from upstream nodes,
**So that** mapping values are substituted with actual runtime data before output rendering.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Simple binding resolves to upstream value
    - **Given** a binding expression `{{extractionNode.FirstName}}` and an upstream context containing `{ extractionNode: { FirstName: "Alice" } }`
    - **When** the resolver processes the binding
    - **Then** the binding is replaced with `"Alice"`

- [x] **Scenario 2**: Deeply nested binding resolves through arbitrary depth
    - **Given** a binding expression `{{extractionNode.payload.header.userId}}` and a matching nested value in upstream context
    - **When** the resolver processes the binding
    - **Then** the binding is replaced with the value at that nested path

- [x] **Scenario 3**: Literal string values pass through unchanged
    - **Given** a mapping value that contains no `{{...}}` syntax (e.g., `"EA SD81 Submission"`)
    - **When** the resolver processes the value
    - **Then** the value is returned unchanged

- [x] **Scenario 4**: Unresolved binding throws structured error
    - **Given** a binding expression `{{extractionNode.MissingField}}` where `MissingField` does not exist in upstream context
    - **When** the resolver processes the binding
    - **Then** it throws a structured error that identifies the full unresolved path (e.g., `"extractionNode.MissingField"`)

- [x] **Scenario 5**: Bindings can reference any prior node in the workflow
    - **Given** a mapping with `{{nodeA.value}}` and `{{nodeB.value}}` where both `nodeA` and `nodeB` are prior nodes (not just the immediate predecessor)
    - **When** the resolver processes both bindings against a context containing outputs from `nodeA` and `nodeB`
    - **Then** both bindings are resolved correctly

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The binding resolver receives a `Record<string, unknown>` representing all prior node outputs keyed by node ID.
- Binding syntax: `{{nodeName.field.subfield}}` — `nodeName` is the first path segment, the rest is the dot-path into that node's parsed output.
- The resolver should recursively walk the field mapping object and replace binding strings in all leaf values.
- When a binding is the entire value of a mapping entry (e.g., `"FirstName": "{{extractionNode.name}}"`), the resolved value may be of any type (string, number, object).
- Unit tests should cover all scenarios including multi-node references and deep nesting.
