# US-010: Integrate PLG Deployment with GitHub Actions and Scripts

**As a** platform operator,
**I want to** deploy the PLG stack using the existing GitHub Actions workflow and local deployment scripts,
**So that** PLG is deployed consistently alongside the application without a separate deployment process.

## Acceptance Criteria

- [x] **Scenario 1**: GitHub Actions workflow deploys PLG Helm chart
    - **Given** the existing GitHub Actions workflow builds and deploys the application
    - **When** the workflow runs
    - **Then** it also deploys the PLG Helm chart to the same namespace as the application

- [x] **Scenario 2**: Local deployment scripts deploy PLG
    - **Given** the existing deployment scripts in `/scripts` handle application deployment
    - **When** a developer runs the deployment scripts locally
    - **Then** the PLG Helm chart is also deployed to the target namespace

- [x] **Scenario 3**: PLG environment variables configurable per overlay
    - **Given** environment-specific configuration exists for dev, test, and prod
    - **When** deploying to a specific environment
    - **Then** PLG-specific variables (`GRAFANA_ADMIN_PASSWORD`, `LOKI_RETENTION_DAYS`, `LOKI_PVC_SIZE`, `PROMETHEUS_PVC_SIZE`, `METRICS_SCRAPE_INTERVAL`) are sourced from the environment's configuration

- [x] **Scenario 4**: PLG deployment does not affect existing Kustomize deployment
    - **Given** the application is deployed via Kustomize
    - **When** the PLG Helm chart is deployed
    - **Then** the existing Kustomize resources are not modified or disrupted

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- PLG is a separate Helm release, not integrated into Kustomize
- The GitHub Actions workflow needs a Helm install/upgrade step added
- Deployment scripts need a Helm install/upgrade command added
- Environment variables are managed via config files or secrets per environment
