---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/openshift-deployment/
  - scripts/README.md
  - docs-md/LOAD_TESTING.md
  - docs-md/LOCAL_MONITORING_STACK.md
  - docs-md/ALERTING.md
  - .github/workflows/
  - deployments/
do_not_duplicate:
  - Full deployment runbooks
  - Backup and restore command sequences
  - Environment variable inventories
  - CI workflow YAML
---

# Deployment and Ops

Deployment and operations guidance spans OpenShift docs, scripts, GitHub Actions workflows, monitoring docs, and load-test runbooks. This page is the map; the runbooks remain canonical in their own files.

## Source Map

- OpenShift deployment docs live under `docs-md/openshift-deployment/`.
- Script usage and maintenance operations live in `scripts/README.md`.
- Load testing guidance lives in `docs-md/LOAD_TESTING.md`.
- Monitoring and alerting guidance lives in `docs-md/LOCAL_MONITORING_STACK.md` and `docs-md/ALERTING.md`.
- CI/CD behavior lives in `.github/workflows/`.
- Kubernetes, Helm, and local deployment assets live under `deployments/`.

## Design Notes

- Prefer linking to exact runbooks instead of copying command sequences.
- Keep environment variable inventories in canonical deployment docs or samples, not in the wiki.
- Treat load-test guidance as disposable-environment oriented unless a canonical doc says otherwise.

## Related Topics

- [Blob storage](blob-storage.md): provider configuration across environments.
- [System overview](system-overview.md): service topology that deployment docs must match.
- [Graph workflows](graph-workflows.md): Temporal and worker deployment dependencies.

## Common Drift Risks

- Script options and OpenShift docs can drift when deployment workflow YAML changes.
- Monitoring rules may be generated into deployment paths; document generation sources rather than generated copies.
- Backup and restore docs should be reviewed after changes to database, blob storage, or deployment topology.
