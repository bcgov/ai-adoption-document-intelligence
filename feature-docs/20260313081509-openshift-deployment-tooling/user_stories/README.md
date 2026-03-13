NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `feature-docs/20260313081509-openshift-deployment-tooling/user_stories/`.

Read both requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file

## Foundation / Setup (US-001 to US-003) -- HIGH priority
| File | Title |
|---|---|
| `US-001-service-account-setup.md` | Service Account Setup Script |
| `US-002-environment-configuration.md` | Environment Configuration Files |
| `US-003-instance-name-derivation.md` | Instance Name Derivation from Git Branch |

## Infrastructure / Templates (US-004 to US-005) -- HIGH priority
| File | Title |
|---|---|
| `US-004-kustomize-instance-template.md` | Kustomize Instance Template Overlay |
| `US-005-github-actions-image-build.md` | GitHub Actions Image Build Workflow |

## Core Deployment (US-006 to US-007) -- HIGH priority
| File | Title |
|---|---|
| `US-006-deploy-script-core-flow.md` | Deploy Script — Core Flow |
| `US-007-deploy-script-apply-and-output.md` | Deploy Script — Overlay Apply, Migrations & Output |

## Lifecycle Management (US-008 to US-009) -- HIGH/MEDIUM priority
| File | Title |
|---|---|
| `US-008-instance-teardown-script.md` | Instance Teardown Script |
| `US-009-list-instances-script.md` | List Instances Script |

## Database Operations (US-010 to US-011) -- HIGH priority
| File | Title |
|---|---|
| `US-010-database-backup-script.md` | Database Backup Script |
| `US-011-database-restore-script.md` | Database Restore Script |

## Suggested Implementation Order (by dependency chain)

### Phase 1 — Foundation
- [x] **US-001** (Service account setup — all scripts depend on the SA token)
- [x] **US-002** (Environment configuration files — deploy needs config)
- [x] **US-003** (Instance name derivation — shared utility for all scripts)

### Phase 2 — Infrastructure
- [x] **US-004** (Kustomize instance template — deploy script needs this to generate manifests)
- [x] **US-005** (GitHub Actions image build — deploy needs images to pull)

### Phase 3 — Core Deployment
- [x] **US-006** (Deploy script core flow — token validation, config loading, image build trigger)
- [x] **US-007** (Deploy script overlay apply — Kustomize generation, migrations, access URLs)

### Phase 4 — Lifecycle Management
- [x] **US-008** (Instance teardown script — uses SA token + instance naming)
- [ ] **US-009** (List instances script — uses SA token + instance naming)

### Phase 5 — Database Operations
- [ ] **US-010** (Database backup script — needs a running instance to back up)
- [ ] **US-011** (Database restore script — needs a backup file + running instance)

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
