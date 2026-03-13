# US-011: Database Restore Script

**As a** Developer,
**I want to** restore a database from a local SQL dump file into any instance,
**So that** I can recover data after a teardown/redeploy or migrate data between instances.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Restore from local backup file
    - **Given** a backup file exists at `./backups/feature-my-thing-2026-03-13.sql`
    - **When** the developer runs `./scripts/oc-restore-db.sh --instance feature-other-work --from ./backups/feature-my-thing-2026-03-13.sql`
    - **Then** the SQL dump is applied to the `feature-other-work` instance's database

- [ ] **Scenario 2**: Cross-instance restore
    - **Given** a backup from instance A exists
    - **When** the developer restores it into instance B
    - **Then** instance B's database contains the data from instance A's backup

- [ ] **Scenario 3**: Destroy-and-rebuild workflow
    - **Given** a developer has backed up their instance, torn it down, and redeployed
    - **When** they restore from the backup into the new instance
    - **Then** the new instance has all the data from the original instance

- [ ] **Scenario 4**: Missing backup file error
    - **Given** the specified backup file does not exist
    - **When** the developer runs the restore script
    - **Then** the script exits with a clear error message indicating the file was not found

- [ ] **Scenario 5**: Restore uses pg_restore via pod exec
    - **Given** the script is restoring a database
    - **When** the restore is performed
    - **Then** the script execs into the Crunchy PostgreSQL pod and runs `pg_restore` (not Crunchy Operator's pgBackRest)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses the SA token from `.oc-deploy-token` for all `oc` commands
- Requires pods/exec permission on the SA (granted in US-001)
- Blob storage (Azure) is not part of restore — it persists independently
- The target instance must be running (database pod must be ready) before restore can proceed
