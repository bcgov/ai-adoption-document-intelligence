# US-010: Database Backup Script

**As a** Developer,
**I want to** create a pg_dump backup of any instance's database and download it to my local machine,
**So that** I can preserve data before teardowns or migrate data between instances.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Successful database backup
    - **Given** an instance `feature-my-thing` is running with a PostgreSQL database
    - **When** the developer runs `./scripts/oc-backup-db.sh --instance feature-my-thing`
    - **Then** a SQL dump file is created at `./backups/feature-my-thing-<timestamp>.sql` on the local filesystem

- [x] **Scenario 2**: Default instance from git branch
    - **Given** the developer is on branch `feature/my-thing`
    - **When** they run `./scripts/oc-backup-db.sh` without `--instance`
    - **Then** the script backs up the database for the instance derived from the current branch

- [x] **Scenario 3**: Backups directory is gitignored
    - **Given** a backup has been created in `./backups/`
    - **When** the developer runs `git status`
    - **Then** the backups directory is not shown as untracked (it is listed in `.gitignore`)

- [x] **Scenario 4**: Backup uses pg_dump via pod exec
    - **Given** the script is backing up a database
    - **When** the dump is performed
    - **Then** the script execs into the Crunchy PostgreSQL pod and runs `pg_dump` (not Crunchy Operator's pgBackRest)

- [x] **Scenario 5**: Blob storage is not included
    - **Given** the instance uses Azure Blob Storage for file content
    - **When** the backup runs
    - **Then** only the PostgreSQL database is backed up — blob storage content is not included

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses the SA token from `.oc-deploy-token` for all `oc` commands
- Requires pods/exec permission on the SA (granted in US-001)
- Blob storage (Azure) persists independently and is not part of backup/restore
- The `backups/` directory must be listed in `.gitignore`
