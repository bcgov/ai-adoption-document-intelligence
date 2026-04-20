# Login with Service Account

Log in to OpenShift using the stored service account token. Use this before running deployment commands if your session has expired.

## Steps

1. **Run login**:
   ```bash
   ./scripts/oc-login-sa.sh
   ```

2. **Report results**: Confirm successful login and namespace.

## Common Pitfalls

- **Token file missing**: Run `./scripts/oc-setup-sa.sh --namespace <ns>` first.
- **Token expired**: Re-run setup to generate a new token.
