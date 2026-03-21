# Check Deployment Status

Show the current deployment status for an instance, including pod health, image versions, and access URLs.

## Arguments

- `--instance <name>` (optional) — Instance to check (default: derived from git branch)

## Steps

1. **Login if needed**:
   ```bash
   ./scripts/oc-login-sa.sh
   ```

2. **Get instance name** (derive from git branch if not specified):
   ```bash
   git rev-parse --abbrev-ref HEAD | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-20
   ```

3. **Check deployments**:
   ```bash
   oc get deployments -l app.kubernetes.io/instance=<instance> -o wide
   ```

4. **Check pods**:
   ```bash
   oc get pods -l app.kubernetes.io/instance=<instance> -o wide
   ```

5. **Check routes**:
   ```bash
   oc get routes -l app.kubernetes.io/instance=<instance>
   ```

6. **Report results**: Format output showing deployment health, pod status, and access URLs.

## Common Pitfalls

- **Not logged in**: Run `./scripts/oc-login-sa.sh` first.
- **Wrong instance name**: The auto-derived name truncates to 20 chars.
