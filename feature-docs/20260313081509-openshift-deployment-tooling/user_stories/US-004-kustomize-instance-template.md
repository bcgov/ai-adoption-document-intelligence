# US-004: Kustomize Instance Template Overlay

**As a** Developer,
**I want to** have a parameterized Kustomize overlay template that generates instance-specific manifests,
**So that** the deploy script can create fully isolated Kubernetes resources for each instance.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Instance template generates prefixed resources
    - **Given** the instance template at `deployments/openshift/kustomize/overlays/instance-template/`
    - **When** the deploy script generates an overlay for instance `feature-my-thing`
    - **Then** all resource names are prefixed with `feature-my-thing-` (e.g., `feature-my-thing-backend`, `feature-my-thing-frontend`)

- [ ] **Scenario 2**: Instance label applied to all resources
    - **Given** a generated instance overlay
    - **When** the manifests are rendered
    - **Then** every resource has the label `app.kubernetes.io/instance: <instance-name>`

- [ ] **Scenario 3**: Each instance gets its own complete stack
    - **Given** an instance overlay is applied
    - **When** the resources are created in OpenShift
    - **Then** the instance has its own: Crunchy PostgreSQL cluster, Temporal server + worker + UI, backend deployment, frontend deployment, routes, ConfigMaps, Secrets, PVCs, and NetworkPolicies

- [ ] **Scenario 4**: Instance routes include instance name in hostname
    - **Given** a generated instance overlay
    - **When** routes are created
    - **Then** each route hostname includes the sanitized instance name as part of the hostname

- [ ] **Scenario 5**: Existing overlays remain untouched
    - **Given** existing `dev/`, `test/`, `prod/` overlays in `deployments/openshift/kustomize/overlays/`
    - **When** the instance template is added
    - **Then** no changes are made to existing overlay files

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Reuses existing base manifests from `deployments/openshift/kustomize/base/`
- NetworkPolicies must scope traffic to the instance label (no cross-instance communication)
- The template is parameterized — the deploy script fills in instance name, config values, and image references at deploy time
