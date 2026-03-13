# US-008: Instance Teardown Script

**As a** Developer,
**I want to** run a single command that completely destroys all resources for my instance,
**So that** I can clean up after myself and free namespace resources.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Complete resource deletion
    - **Given** an instance `feature-my-thing` is deployed in the namespace
    - **When** the developer runs `./scripts/oc-teardown.sh`
    - **Then** all Kubernetes resources matching the instance label `app.kubernetes.io/instance=feature-my-thing` are deleted, including deployments, services, routes, secrets, configmaps, PVCs, and the Crunchy PostgreSQL cluster

- [ ] **Scenario 2**: Instance name from git branch
    - **Given** the developer is on branch `feature/my-thing`
    - **When** they run `./scripts/oc-teardown.sh` without `--instance`
    - **Then** the script derives the instance name from the current branch and tears down that instance

- [ ] **Scenario 3**: Explicit instance name
    - **Given** the developer wants to teardown a specific instance
    - **When** they run `./scripts/oc-teardown.sh --instance feature-other-work`
    - **Then** the script tears down the specified instance regardless of the current git branch

- [ ] **Scenario 4**: No interactive prompts
    - **Given** the developer runs the teardown script
    - **When** the script executes
    - **Then** it completes without any interactive prompts or confirmation dialogs

- [ ] **Scenario 5**: Last instance cleanup
    - **Given** this is the last instance in the namespace
    - **When** the teardown completes
    - **Then** the script also removes the service account and deletes the local `.oc-deploy-token` file

- [ ] **Scenario 6**: Teardown does not auto-backup
    - **Given** the developer runs teardown
    - **When** the script executes
    - **Then** no automatic database backup is performed — backup/restore are separate operations

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses the SA token from `.oc-deploy-token` for all `oc` commands
- Deletes by label selector, not by resource name — ensures complete cleanup
- Database backup is a separate, explicit action (REQ-3)
