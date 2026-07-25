# Instance Name Derivation

## Overview

The `scripts/lib/instance-name.sh` library provides shared functions for deriving, sanitizing, and using instance names across all OpenShift deployment scripts. Instance names uniquely identify a deployment of the full application stack within a shared namespace.

## Sanitization Rules

Branch names and user-provided instance names are sanitized to comply with Kubernetes naming requirements:

| Rule | Example |
|------|---------|
| Convert to lowercase | `Feature/MY-THING` -> `feature-my-thing` |
| Replace slashes with hyphens | `feature/my-thing` -> `feature-my-thing` |
| Replace underscores with hyphens | `feature_my_thing` -> `feature-my-thing` |
| Replace dots with hyphens | `release.1.0` -> `release-1-0` |
| Replace any non-alphanumeric, non-hyphen character | `feature@test` -> `feature-test` |
| Collapse consecutive hyphens | `feature//my__thing` -> `feature-my-thing` |
| Strip leading/trailing hyphens | `-my-branch-` -> `my-branch` |
| Truncate to 20 characters | Long names are truncated without leaving a trailing hyphen |

## Truncation Rationale

Instance names are truncated to 20 characters because the Crunchy PostgreSQL operator generates labels and hostnames from the PostgresCluster name plus internal suffixes (e.g., `<instance>-temporal-pg-repo-host-<hash>`). Kubernetes labels and hostnames have a 63-character limit, so keeping the instance name short prevents exceeding those limits.

The image tag used for container images is decoupled from the instance name and allows up to 128 characters (the OCI tag limit), so image tags are not affected by instance name truncation.

## Resource Naming Convention

All Kubernetes resources for an instance follow this pattern:

- **Name prefix**: `<instance-name>-<service>` (e.g., `feature-my-thing-backend`)
- **Label**: `app.kubernetes.io/instance=<instance-name>` applied to all resources

This enables unique resource names across multiple instances in the same namespace and label-based selection for listing, updating, and tearing down instance resources.

## Library API

```bash
source scripts/lib/instance-name.sh
```

| Function | Arguments | Returns |
|----------|-----------|---------|
| `sanitize_instance_name` | `<raw-name>` | Sanitized name (stdout) |
| `resolve_instance_name` | `[script-args...]` | Resolved instance name from `--instance` flag or git branch (stdout) |
| `get_resource_name` | `<instance-name> <service-name>` | Prefixed resource name (stdout) |
| `get_instance_label` | `<instance-name>` | Label string `app.kubernetes.io/instance=<name>` (stdout) |
| `get_instance_selector` | `<instance-name>` | Selector string (stdout) |

### Testing

```bash
bash scripts/lib/instance-name.test.sh
```
