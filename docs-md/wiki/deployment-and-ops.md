---
status: active
updated: 2026-10-02
canonical_sources:
  - docs-md/operations/
  - scripts/README.md
  - docs-md/benchmarking/LOAD_TESTING.md
  - docs-md/monitoring/LOCAL_MONITORING_STACK.md
  - docs-md/monitoring/ALERTING.md
  - docs-md/monitoring/AZURE_LOG_ANALYTICS_MIRROR.md
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

- OpenShift deployment docs live under `docs-md/operations/`.
- Script usage and maintenance operations live in `scripts/README.md`.
- Load testing guidance lives in `docs-md/benchmarking/LOAD_TESTING.md`.
- Monitoring and alerting guidance lives in `docs-md/monitoring/LOCAL_MONITORING_STACK.md` and `docs-md/monitoring/ALERTING.md`.
- The Azure Log Analytics log mirror lives in `docs-md/monitoring/AZURE_LOG_ANALYTICS_MIRROR.md`: a Fluent Bit shipper that tails the same files as Promtail and feeds an Azure SRE Agent. It runs beside the Loki pipeline rather than changing it, so local-stack questions still start at `LOCAL_MONITORING_STACK.md`.
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
- The Azure mirror ships a filtered subset while Loki keeps everything, so the two log views legitimately disagree; filter rules live in `deployments/local/fluent-bit/filters.lua` and drift from what the SRE agent can actually see.
- Backup and restore docs should be reviewed after changes to database, blob storage, or deployment topology.
