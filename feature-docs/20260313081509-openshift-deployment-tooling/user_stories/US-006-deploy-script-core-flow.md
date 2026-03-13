# US-006: Deploy Script — Core Flow

**As a** Developer,
**I want to** run a single command that validates prerequisites, resolves configuration, and triggers image builds for my instance,
**So that** the deployment is properly initialized before applying resources to OpenShift.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Successful full stack deployment
    - **Given** the developer has a valid `.oc-deploy-token` and is on a feature branch
    - **When** they run `./scripts/oc-deploy.sh --env dev`
    - **Then** the script deploys frontend, backend, Temporal server + worker + UI, and Crunchy PostgreSQL database as a fully isolated instance

- [x] **Scenario 2**: Token validation on startup
    - **Given** the `.oc-deploy-token` file does not exist
    - **When** the developer runs `./scripts/oc-deploy.sh`
    - **Then** the script exits with a clear error message directing them to run `oc-setup-sa.sh` first

- [x] **Scenario 3**: Image build trigger or verification
    - **Given** the developer runs the deploy script
    - **When** the script starts
    - **Then** it triggers the GitHub Actions build workflow or verifies that images already exist on ghcr.io for the current branch/commit before proceeding

- [x] **Scenario 4**: Configuration loading
    - **Given** the developer specifies `--env dev`
    - **When** the script loads configuration
    - **Then** it loads `deployments/openshift/config/dev.env` as defaults, then applies any instance-specific overrides from `deployments/openshift/config/<instance-name>.env` if it exists

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses the SA token from `.oc-deploy-token` for all `oc` commands
- Deploy flow: token check -> instance name -> load config -> build/verify images -> (continues in US-007)
- Existing `dev/test/prod` overlays remain untouched
