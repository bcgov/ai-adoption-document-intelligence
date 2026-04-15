# US-008: Implement Array Iteration Support

**As a** developer building the transformation engine,
**I want to** iterate over arrays in the input data using `{{#each arrayPath}}` ... `{{/each}}` markers in the field mapping,
**So that** repeating structures (lists of items) can be rendered correctly in all supported output formats.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Iteration block renders once per array element
    - **Given** a mapping with `{{#each extractionNode.items}}` ... `{{/each}}` and an upstream array of 3 elements
    - **When** the binding resolver processes the iteration block
    - **Then** the body of the block is rendered 3 times, once for each element

- [ ] **Scenario 2**: {{this.fieldName}} accesses fields on the current element
    - **Given** an iteration block body that references `{{this.name}}` and `{{this.value}}` and the current element has those fields
    - **When** the resolver processes each iteration
    - **Then** `{{this.name}}` resolves to the element's `name` value and `{{this.value}}` to its `value`

- [ ] **Scenario 3**: Empty array produces no output without error
    - **Given** an iteration block whose `arrayPath` resolves to an empty array (`[]`)
    - **When** the resolver processes the iteration block
    - **Then** no output is produced for that block and no error is thrown

- [ ] **Scenario 4**: XML output produces repeated child elements per iteration
    - **Given** an iteration block inside an XML output mapping
    - **When** the XML renderer processes the resolved iteration
    - **Then** each iteration produces a repeated XML child element in the output

- [ ] **Scenario 5**: CSV output produces additional data rows per iteration
    - **Given** an iteration block inside a CSV output mapping
    - **When** the CSV renderer processes the resolved iteration
    - **Then** each iteration produces an additional data row below the header row

- [ ] **Scenario 6**: JSON output collects iterations into an array
    - **Given** an iteration block inside a JSON output mapping
    - **When** the JSON renderer processes the resolved iteration
    - **Then** iterations are collected into a JSON array value for the containing key

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The iteration syntax in mapping keys: `"{{#each nodeName.arrayField}}"` as a key and `"{{/each}}"` as a sibling key with empty string value.
- This requires the binding resolver to detect and handle `{{#each ...}}` / `{{/each}}` patterns specially, before regular binding resolution.
- An unresolvable `arrayPath` (path does not exist or is not an array) should throw a structured error identifying the path.
- `{{this.fieldName}}` and the shorthand `{{fieldName}}` within the block should both resolve to the current element's field.
- Unit tests should cover all three output format paths, empty array, and unresolvable path.
