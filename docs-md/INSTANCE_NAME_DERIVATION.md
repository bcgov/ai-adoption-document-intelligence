# Instance Name Derivation

## Overview

The `instance-name.sh` library provides shared functions for deriving, sanitizing, and using instance names across all OpenShift deployment scripts. Instance names uniquely identify a deployment of the full application stack within a shared namespace.

By default, the instance name is derived from the current git branch name, sanitized to comply with Kubernetes naming conventions. Developers can override this with the `--instance` flag.

## Usage

Source the library in any script:

```bash
source "$(dirname "${BASH_SOURCE[0]}")/lib/instance-name.sh"
```

### Resolve an Instance Name

```bash
# From git branch (automatic)
INSTANCE_NAME=$(resolve_instance_name "$@")

# With --instance override from script arguments
# ./scripts/oc-deploy.sh --instance my-custom-name
INSTANCE_NAME=$(resolve_instance_name "$@")
```

The `resolve_instance_name` function:
1. Checks for `--instance <name>` in the provided arguments
2. If not provided, reads the current git branch name
3. Sanitizes the result for Kubernetes naming compliance

### Sanitize a Name

```bash
sanitized=$(sanitize_instance_name "feature/my-thing")
# Result: "feature-my-thing"
```

### Generate Resource Names

```bash
resource=$(get_resource_name "feature-my-thing" "backend")
# Result: "feature-my-thing-backend"
```

### Generate Instance Labels

```bash
label=$(get_instance_label "feature-my-thing")
# Result: "app.kubernetes.io/instance=feature-my-thing"

selector=$(get_instance_selector "feature-my-thing")
# Result: "app.kubernetes.io/instance=feature-my-thing"
```

## Sanitization Rules

Branch names and user-provided instance names are sanitized to comply with Kubernetes naming requirements:

| Rule | Example |
|------|---------|
| Convert to lowercase | `Feature/MY-THING` → `feature-my-thing` |
| Replace slashes with hyphens | `feature/my-thing` → `feature-my-thing` |
| Replace underscores with hyphens | `feature_my_thing` → `feature-my-thing` |
| Replace dots with hyphens | `release.1.0` → `release-1-0` |
| Replace any non-alphanumeric, non-hyphen character | `feature@test` → `feature-test` |
| Collapse consecutive hyphens | `feature//my__thing` → `feature-my-thing` |
| Strip leading/trailing hyphens | `-my-branch-` → `my-branch` |
| Truncate to 63 characters | Long names are truncated without leaving a trailing hyphen |

## Resource Naming Convention

All Kubernetes resources for an instance follow this pattern:

- **Name prefix**: `<instance-name>-<service>` (e.g., `feature-my-thing-backend`)
- **Label**: `app.kubernetes.io/instance=<instance-name>` applied to all resources

This enables:
- Unique resource names across multiple instances in the same namespace
- Label-based selection for listing, updating, and tearing down instance resources

## Functions Reference

| Function | Arguments | Returns |
|----------|-----------|---------|
| `sanitize_instance_name` | `<raw-name>` | Sanitized name (stdout) |
| `resolve_instance_name` | `[script-args...]` | Resolved instance name (stdout) |
| `get_resource_name` | `<instance-name> <service-name>` | Prefixed resource name (stdout) |
| `get_instance_label` | `<instance-name>` | Label string (stdout) |
| `get_instance_selector` | `<instance-name>` | Selector string (stdout) |

## Testing

```bash
bash scripts/lib/instance-name.test.sh
```
