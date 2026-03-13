# US-007: Deploy Script — Overlay Apply, Migrations & Output

**As a** Developer,
**I want to** have the deploy script generate and apply Kustomize overlays, run migrations, and print access URLs,
**So that** my instance is fully operational and I know how to access it.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Kustomize overlay generation and apply
    - **Given** configuration is loaded and images are available
    - **When** the script deploys
    - **Then** it generates a Kustomize overlay from the instance template with the correct namePrefix, labels, config values, and image references, then runs `oc apply -k`

- [ ] **Scenario 2**: Prisma migrations run during deployment
    - **Given** the instance is being deployed
    - **When** the backend starts
    - **Then** Prisma migrations run via the existing init container pattern

- [ ] **Scenario 3**: Access URLs printed on completion
    - **Given** deployment completes successfully and all rollouts are ready
    - **When** the script finishes
    - **Then** it prints the access URLs for the frontend route, backend route, and Temporal UI route

- [ ] **Scenario 4**: Default instance name from git branch
    - **Given** the developer does not specify `--instance`
    - **When** the script derives the instance name
    - **Then** it uses the current git branch, sanitized for Kubernetes naming

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Continues the deploy flow from US-006: -> generate overlay -> `oc apply -k` -> wait for rollout -> print URLs
- Waits for rollout completion before printing URLs
- Uses the SA token from `.oc-deploy-token` for all `oc` commands
