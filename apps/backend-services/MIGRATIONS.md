# Database Migrations Guide

This document explains how database migrations are handled automatically in the OpenShift deployment.

## Overview

Prisma migrations are automatically run when the application is deployed to OpenShift using an init container. Migrations run before the main application container starts, ensuring:

- Migrations complete before the app accepts traffic
- If migrations fail, the pod won't start (fail-fast)
- Migrations run only once per pod
- Clear separation of concerns

### How It Works

The deployment includes an init container that:
1. Uses the same image as the main application
2. Runs `npx prisma migrate deploy` before the app starts
3. Uses the `DATABASE_URL` from a Kubernetes Secret

### Configuration

The init container is configured in `deployments/openshift/kustomize/base/backend-services/deployment.yml`:

```yaml
initContainers:
- name: migrate-db
  image: artifacts.developer.gov.bc.ca/kfd3-fd34fb-local/backend-services:latest
  command: ['npx', 'prisma', 'migrate', 'deploy']
  env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: postgres-cluster-pguser-admin
        key: uri
```

### Prerequisites

1. **Database Secret**: The `DATABASE_URL` must be available as a Kubernetes Secret. For CrunchyDB PostgresCluster, the secret is typically named:
   - Pattern: `{cluster-name}-pguser-{username}`
   - Example: `postgres-cluster-pguser-admin`
   - Key: `uri` (contains the full PostgreSQL connection string)

2. **Dockerfile**: The Dockerfile must include:
   - Prisma CLI (included via `npm install`)
   - Prisma schema and migrations directory

### Verifying the Secret

To check if the secret exists and view its structure:

```bash
oc get secret postgres-cluster-pguser-admin -o yaml
```

If the secret name is different, update the `secretKeyRef.name` in the deployment.

## Migration Commands

### Local Development

```bash
# Create a new migration
npm run db:migrate

# Check migration status
npm run db:status

# Reset database (WARNING: deletes all data)
npm run db:reset
```

### Production

The `prisma migrate deploy` command is used in production, which:
- Only applies pending migrations (safe for production)
- Does not create new migrations
- Is idempotent (safe to run multiple times)

## Troubleshooting

### Migrations Fail in Init Container

1. Check the init container logs:
   ```bash
   oc logs <pod-name> -c migrate-db
   ```

2. Verify the DATABASE_URL secret exists:
   ```bash
   oc get secret postgres-cluster-pguser-admin
   ```

3. Test the connection string manually:
   ```bash
   oc exec <pod-name> -c migrate-db -- env | grep DATABASE_URL
   ```

### Secret Name Mismatch

If your PostgresCluster creates secrets with a different naming pattern, update the deployment:

```yaml
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: <your-secret-name>
      key: uri  # or 'password', 'host', etc. depending on your secret structure
```

### Connection Issues

Ensure:
- The database service is accessible from the pod
- Network policies allow connection
- The database user has proper permissions
- The database exists (created by PostgresCluster)

## Best Practices

1. **Always test migrations locally** before deploying
2. **Use init containers in production** for better reliability
3. **Monitor migration logs** during deployments
4. **Keep migrations small and focused** - large migrations can cause downtime
5. **Use transactions** when possible (Prisma does this by default)
6. **Backup before major migrations** in production

## Related Files

- `deployments/openshift/kustomize/base/backend-services/deployment.yml` - Init container configuration
- `apps/backend-services/Dockerfile` - Includes Prisma CLI and migrations
- `apps/shared/prisma/schema.prisma` - Database schema (shared between backend-services and temporal)
- `apps/shared/prisma/migrations/` - Migration files (shared between backend-services and temporal)


