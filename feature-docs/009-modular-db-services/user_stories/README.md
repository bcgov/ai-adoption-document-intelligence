# User Stories: Modular Database Services

This folder contains all user stories for the **Modular Database Services** feature (007).

The goal of this feature is to decompose the monolithic `DatabaseService` by moving each module's database operations into a dedicated db-service that lives within that module.

---

## Phases

### Phase 1 — Create / Move Db-Services

Move existing db-services out of the `database` module and create new ones for modules that previously had inline queries in `DatabaseService`.

- [x] [US-01: Move DocumentDbService into the Document Module](US-01-document-db-service.md)
- [ ] [US-02: Move LabelingDocumentDbService into the Labeling Module](US-02-labeling-document-db-service.md)
- [ ] [US-03: Move LabelingProjectDbService into the Labeling Module](US-03-labeling-project-db-service.md)
- [ ] [US-04: Create GroupDbService in the Group Module](US-04-group-db-service.md)
- [ ] [US-05: Create ClassifierDbService in the Azure Module](US-05-classifier-db-service.md)
- [ ] [US-06: Move ReviewDbService into the HITL Module](US-06-review-db-service.md)

---

### Phase 2 — Transaction Support

Standardise transaction handling across all db-services and services.

- [ ] [US-07: Implement Transaction Support in PrismaService and Db-Services](US-07-transaction-support.md)

---

### Phase 3 — Migrate Consumers

Update modules that currently depend on `DatabaseService` to use the appropriate module services.

- [ ] [US-08: Migrate Benchmark Module Away from DatabaseService](US-08-benchmark-module-migration.md)
- [ ] [US-09: Migrate Training Module Away from DatabaseService](US-09-training-module-migration.md)
- [ ] [US-10: Migrate Upload Module Away from DatabaseService](US-10-upload-module-migration.md)

---

### Phase 4 — DatabaseModule Cleanup

Delete the now-redundant `DatabaseService` and its sub-services; slim `DatabaseModule` down to `PrismaService` only.

- [ ] [US-11: Clean Up DatabaseModule After Full Migration](US-11-database-module-cleanup.md)

---

## Story Summary

| ID | Title | Phase |
|----|-------|-------|
| US-01 | Move DocumentDbService into the Document Module | 1 |
| US-02 | Move LabelingDocumentDbService into the Labeling Module | 1 |
| US-03 | Move LabelingProjectDbService into the Labeling Module | 1 |
| US-04 | Create GroupDbService in the Group Module | 1 |
| US-05 | Create ClassifierDbService in the Azure Module | 1 |
| US-06 | Move ReviewDbService into the HITL Module | 1 |
| US-07 | Implement Transaction Support in PrismaService and Db-Services | 2 |
| US-08 | Migrate Benchmark Module Away from DatabaseService | 3 |
| US-09 | Migrate Training Module Away from DatabaseService | 3 |
| US-10 | Migrate Upload Module Away from DatabaseService | 3 |
| US-11 | Clean Up DatabaseModule After Full Migration | 4 |
