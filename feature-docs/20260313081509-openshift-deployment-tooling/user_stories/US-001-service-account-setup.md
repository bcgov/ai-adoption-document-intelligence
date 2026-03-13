# US-001: Service Account Setup Script

**As a** Developer,
**I want to** run a one-time setup script that creates an OpenShift service account with scoped permissions and stores the token locally,
**So that** all subsequent deployment scripts can authenticate without requiring my personal credentials.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Successful service account creation
    - **Given** the developer is logged into OpenShift with personal credentials (`oc login`)
    - **When** they run `./scripts/oc-setup-sa.sh --namespace <namespace>`
    - **Then** a service account is created in the specified namespace with permissions scoped to: deployments, services, routes, configmaps, secrets, PVCs, pods, pods/exec
    - **And** a token is generated and saved to `.oc-deploy-token` in the project root

- [ ] **Scenario 2**: Token file is gitignored
    - **Given** the script has saved the token to `.oc-deploy-token`
    - **When** the developer runs `git status`
    - **Then** `.oc-deploy-token` is not shown as an untracked file (it is listed in `.gitignore`)

- [ ] **Scenario 3**: Script fails gracefully without oc login
    - **Given** the developer has not logged into OpenShift
    - **When** they run `./scripts/oc-setup-sa.sh --namespace <namespace>`
    - **Then** the script exits with a clear error message indicating they must first run `oc login`

- [ ] **Scenario 4**: Re-running setup is idempotent
    - **Given** the service account already exists in the namespace
    - **When** the developer runs `./scripts/oc-setup-sa.sh --namespace <namespace>` again
    - **Then** the script updates the token file without errors (does not fail on existing resources)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is the only script that requires the developer's personal `oc login` — all other scripts use the stored SA token
- Service account permissions must be the minimum required for deployment operations
- The `.oc-deploy-token` file must already be listed in `.gitignore`
- One-time setup per developer per namespace
