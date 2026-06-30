# US-012: Training Usage Recording and Pre-flight Cap Check

**As a** billing system,
**I want to** record a model_training_started UsageEvent and enforce a cap check when template model or classifier training is submitted to Azure,
**So that** training compute costs are metered and groups cannot exceed their budget through training submissions.

## Acceptance Criteria

- [ ] **Scenario 1**: Template model training records a UsageEvent after successful Azure submission
    - **Given** a `TrainingService` call that successfully submits a template model training job to Azure Document Intelligence
    - **When** the submission returns a success response
    - **Then** a `UsageEvent` with `event_type = "model_training_started"`, `group_id`, `resource_id = TrainingJob.id`, `resource_type = "template_model"`, `units_consumed` from `training_costs.template_model` in the active rate version, and `rate_version_id` is recorded

- [ ] **Scenario 2**: Classifier training records a UsageEvent after successful Azure submission
    - **Given** `ClassifierService.requestClassifierTraining` that successfully submits a classifier build to Azure (202 Accepted)
    - **When** the submission returns 202 Accepted
    - **Then** a `UsageEvent` with `event_type = "model_training_started"`, `group_id`, `resource_id = classifierName`, `resource_type = "classifier"`, and `units_consumed` from `training_costs.classifier` in the active rate version is recorded

- [ ] **Scenario 3**: Pre-flight cap check blocks template model training when over cap
    - **Given** a group with a monthly cap where the training cost would push them over their limit
    - **When** `TrainingService` attempts to submit training to Azure
    - **Then** the Azure submission is not made, and HTTP 402 is returned with the dollar shortfall

- [ ] **Scenario 4**: Pre-flight cap check blocks classifier training when over cap
    - **Given** a group with a monthly cap where the classifier training cost would push them over their limit
    - **When** `ClassifierService.requestClassifierTraining` is called
    - **Then** the Azure submission is not made, and HTTP 402 is returned with the dollar shortfall

- [ ] **Scenario 5**: Training cost is looked up from the active rate version's training_costs
    - **Given** an active rate version with `training_costs = { "template_model": 500, "classifier": 300 }`
    - **When** training usage is recorded or the pre-flight cap check runs
    - **Then** template model training costs 500 units and classifier training costs 300 units

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The pre-flight cap check applies the same atomic read-lock pattern as workflow cap checks (US-005)
- UsageEvent is recorded **after** successful Azure submission, not before — if Azure returns an error, no billing event is recorded
- Both `TrainingService` and `ClassifierService` are in `apps/backend-services/src/`
- The `ClassifierService.requestClassifierTraining` instrumentation point is after the `post(...)` call returns 202 Accepted
