# List Instances

List all deployed instances in the OpenShift namespace with status and age.

## Steps

1. **Run list command**:
   ```bash
   ./scripts/oc-list-instances.sh
   ```

2. **Display results**: Format the output table showing INSTANCE, STATUS, and AGE columns.

## Output Format

```
INSTANCE                  STATUS       AGE
feature-my-thing          Running      2d
feature-other-work        Error        5h
```

Status values: Running, Pending, Error, Unknown

## Common Pitfalls

- **Not logged in**: Run `./scripts/oc-login-sa.sh` first if authentication fails.
