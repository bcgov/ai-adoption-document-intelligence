# US-005: GitHub Actions Image Build Workflow

**As a** Developer,
**I want to** have a GitHub Actions workflow that builds container images from my branch and pushes them to ghcr.io,
**So that** OpenShift can pull the correct images when deploying my instance.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Workflow builds all service images
    - **Given** a developer triggers the workflow (manually or via deploy script)
    - **When** the workflow runs for a given branch
    - **Then** images are built for `backend-services`, `frontend`, and `temporal` using the existing multi-stage Dockerfiles

- [ ] **Scenario 2**: Images are tagged correctly
    - **Given** the workflow completes successfully
    - **When** images are pushed to ghcr.io
    - **Then** images are tagged with both the sanitized branch name and the commit SHA (e.g., `ghcr.io/<org>/ai-adoption-document-intelligence/backend-services:feature-my-thing` and `ghcr.io/<org>/ai-adoption-document-intelligence/backend-services:<commit-sha>`)

- [ ] **Scenario 3**: No PAT required for push
    - **Given** the workflow runs in GitHub Actions
    - **When** images are pushed to ghcr.io
    - **Then** the built-in `GITHUB_TOKEN` is used (with `permissions: packages: write` declared in the workflow)

- [ ] **Scenario 4**: Images are publicly pullable
    - **Given** images are pushed to ghcr.io
    - **When** OpenShift attempts to pull images
    - **Then** no pull secret or authentication is required (repository and packages are public)

- [ ] **Scenario 5**: Existing CI/CD remains untouched
    - **Given** existing workflows (`build-apps.yml`, `migrate-db.yml`, `db-backup-manual.yml`, `db-restore.yml`)
    - **When** the new workflow is added
    - **Then** no changes are made to existing workflow files — the new workflow is additive

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses GitHub Container Registry (ghcr.io) — BCGov recommended pattern for Silver cluster
- Existing Artifactory-based CI/CD pipelines remain untouched
- The deploy script must either trigger this workflow or verify that images already exist for the current branch/commit
- OpenShift Silver's internal registry is not accessible from developer machines, hence ghcr.io
