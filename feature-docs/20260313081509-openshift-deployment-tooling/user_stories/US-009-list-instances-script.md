# US-009: List Instances Script

**As a** Developer,
**I want to** see all deployed instances in the namespace,
**So that** I can understand what is currently running and coordinate with other developers.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: List all running instances
    - **Given** multiple instances are deployed in the namespace
    - **When** the developer runs `./scripts/oc-list-instances.sh`
    - **Then** the output shows a table with columns: INSTANCE, STATUS, AGE for each deployed instance

- [ ] **Scenario 2**: No instances deployed
    - **Given** no instances are deployed in the namespace
    - **When** the developer runs `./scripts/oc-list-instances.sh`
    - **Then** the script outputs a message indicating no instances were found

- [ ] **Scenario 3**: Instance status reflects deployment health
    - **Given** instances are deployed
    - **When** the list is displayed
    - **Then** the STATUS column reflects whether all pods in the instance are running/ready or if any are in error/pending states

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses the SA token from `.oc-deploy-token` for all `oc` commands
- Discovers instances by querying for unique values of the `app.kubernetes.io/instance` label in the namespace
- Designed for a small number of concurrent instances (2-5 typical)
