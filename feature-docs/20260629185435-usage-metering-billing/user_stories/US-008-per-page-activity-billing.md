# US-008: Per-Page Activity Billing via _metered_quantity

**As a** billing system,
**I want to** charge per-page OCR activities based on the actual page count processed,
**So that** groups are billed proportionally to the real volume of OCR work performed rather than a flat estimate.

## Acceptance Criteria

- [ ] **Scenario 1**: azureOcr.extract activity returns _metered_quantity in its result
    - **Given** the `azureOcr.extract` Temporal activity implementation
    - **When** the activity completes successfully
    - **Then** the return value includes a `_metered_quantity: pageCount` field where `pageCount` is the number of pages processed in that extraction call

- [ ] **Scenario 2**: Interceptor detects per_page cost type and reads _metered_quantity
    - **Given** an activity with `cost_type = "per_page"` in the active rate version, and the activity's result contains `_metered_quantity = 7`
    - **When** the interceptor fires after successful activity completion
    - **Then** the interceptor reads `result._metered_quantity` and uses it to compute units consumed

- [ ] **Scenario 3**: units_consumed is correctly calculated as quantity × per-page rate
    - **Given** an activity with `cost_type = "per_page"` and `units = 40`, and `result._metered_quantity = 7`
    - **When** the interceptor records the UsageEvent
    - **Then** `units_consumed = 7 × 40 = 280` and `metered_quantity = 7` are persisted on the event

- [ ] **Scenario 4**: Missing or zero _metered_quantity results in zero units charged
    - **Given** an activity with `cost_type = "per_page"` where the result does not contain `_metered_quantity` (or it is 0)
    - **When** the interceptor fires
    - **Then** `units_consumed = 0` and no `UsageEvent` is recorded (zero-cost events are skipped)

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Only `azureOcr.extract` (or similar per-page activities) need to add `_metered_quantity` to their return value — no other activity code changes are required
- The `_metered_quantity` field is a contract between the activity and the billing interceptor; it is ignored by all other activity result consumers
- The field should be typed in the activity return type as `_metered_quantity?: number`
- The interceptor already handles the `cost_type` check from US-007 — this story extends the interceptor to also handle the `per_page` branch
