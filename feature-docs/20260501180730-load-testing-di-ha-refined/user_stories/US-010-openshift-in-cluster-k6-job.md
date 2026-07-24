# US-010: OpenShift in-cluster k6 for egress-constrained namespaces

**As a** platform engineer,
**I want to** run k6 load scenarios inside the OpenShift namespace using ClusterIP URLs only,
**So that** load tests work when pods cannot rely on outbound internet or external load generators.

## Acceptance Criteria

- [x] **Scenario 1**: Requirements and operator docs describe Job/CronJob pattern
    - **Given** an egress-constrained OpenShift cluster
    - **When** operators read load-testing documentation
    - **Then** they find guidance to run k6 as `Job`/`CronJob` with scripts from ConfigMap.

- [x] **Scenario 2**: In-cluster base URL is mandatory for this pattern
    - **Given** in-cluster k6 execution
    - **When** `BASE_URL` is configured
    - **Then** it targets the backend ClusterIP Service (for example `http://backend-services:3002`), not an external Route-only URL.

- [x] **Scenario 3**: Secrets handling is explicit
    - **Given** API key authentication for k6
    - **When** manifests are authored
    - **Then** `LOAD_TEST_API_KEY` is sourced from a Kubernetes/OpenShift Secret reference, not committed plaintext.

- [x] **Scenario 4**: Network and registry constraints are documented
    - **Given** NetworkPolicy and disconnected-registry restrictions
    - **When** documentation is complete
    - **Then** it notes allowlisting traffic to `backend-services:3002` and mirroring the k6 image when public pulls are blocked.

## Priority

- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Backend Service name/port match [`deployments/openshift/kustomize/base/backend-services/service.yml`](../../../deployments/openshift/kustomize/base/backend-services/service.yml).
- Sample Job manifests and Kustomize live under [`tools/load-testing/`](../../../tools/load-testing/) (`kustomization.yml` + `openshift/*.yaml`); apply with `oc apply -k tools/load-testing`.
