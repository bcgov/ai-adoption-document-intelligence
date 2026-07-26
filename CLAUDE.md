- When updating existing code, do not add backwards compatibility features.
- Avoid using "any" types in both back end and front end code, use proper typing.
- When creating or updating backend code also create and update related tests. If backend code was updated, run tests to ensure they still pass. Adjust tests if they fail and re-run.
- Do not create "placeholders" or any other types of partial implementations or stubs for "future use", implement features requested only.
- Do not create features that are not explicitly described in specifications, if there is a gap, include it summary notes after implementing the task. If there is a question regarding the implementation, do not make assumptions, stop and clarify from the user.
- When creating or modifying features, create/update documentation in the matching `/docs-md` topic folder (taxonomy in `docs-md/README.md`). The `docs-sync` skill (`.claude/skills/docs-sync/`) has workflows for keeping docs in sync, auditing accuracy, adding docs, and archiving stale ones.
- If you need to run `npx prisma generate`, run `npm run db:generate` from `apps/backend-services` - it's a special script that writes models into apps/temporal/src and apps/backend-services/src. Don't forget to run migrations as normal if necessary.
- Do not include any document-specific implementation, the system is generic and must support arbitrary workloads
- All backend controllers must have full Swagger/OpenAPI documentation: use specific decorators (`@ApiOkResponse`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`, `@ApiConflictResponse`, etc.) instead of generic `@ApiResponse`, create dedicated DTO classes with `@ApiProperty` decorators for all request/response shapes, and reference those DTOs via the `type` field in response decorators.
- To test API directly, use: `curl -H "x-api-key: $API_KEY" http://localhost:3002/api/...` (read the key from your local env/config; never paste or log secret values).
- NEVER read secrets from .env files directly, they should not be leaked into chat, terminal, etc., do not operate with secret values directly, only indirectly through variables.
- **Database transactions:** Any operation that performs two or more database writes that must stay consistent MUST run inside a single Prisma transaction. Db-services accept optional `tx?: Prisma.TransactionClient` as the last parameter and use `const client = tx ?? this.prisma`. Services initiate cross-module transactions via `prismaService.transaction(async (tx) => { ... })` and pass `tx` to db-services (and other services) — never query `tx` directly in services. Controllers never initiate or receive transactions. See [docs-md/architecture/DATABASE_SERVICES.md](docs-md/architecture/DATABASE_SERVICES.md).
- **Audit on mutations:** Every user-initiated create/update/delete (and every service-layer mutation transaction) MUST record an audit event via `AuditService.recordEvent` (global) or `AuditLogService` / `AuditLogDbService` (benchmark). Pass the same `tx` into audit when the mutation is transactional; otherwise call audit immediately after a successful commit. Audit failures must not fail the main operation unless audit is intentionally in the same transaction. Read/access endpoints follow [docs-md/architecture/AUDIT.md](docs-md/architecture/AUDIT.md). When reviewing or adding backend code, check [docs-md/architecture/TRANSACTION_AND_AUDIT_AUDIT.md](docs-md/architecture/TRANSACTION_AND_AUDIT_AUDIT.md) for known gaps.
- Repo wiki rules: see `AGENTS.md` (Repo Wiki section).
- Skills: see `AGENTS.md` (Skills section). Use `.claude/skills/documentation/` when updating docs or the wiki; use `.claude/skills/create-pr/` when opening a pull request.

## Cross-feature obligations

Specs describe features. These describe the **joins between** features — which is
where this codebase has actually broken. Every defect found in the 2026-07-25
walkthrough was two individually-correct decisions that were wrong in
combination, and each obligation below is named after one that cost real time.
State how a change meets each, or waive it with a reason.

- **Authorable** — anything the config can express, the UI can set. No model
  field ships without an authoring path. *(`errorPolicy` was supported by the
  engine and the schema and had no form for months.)*
- **Visible and reversible** — anything the system decides on the user's behalf
  is shown, and can be undone or overridden. *(Auto-wire bound a map's loop item
  and drew no wire, so the author could neither see nor delete the binding.)*
- **Surfaces agree** — if a fact appears in more than one place, name every place
  and make them agree. *(The amber port ring and the problems badge disagreed for
  a release; each was individually correct.)*
- **Fail before the run** — a state the runtime cannot satisfy is reported at
  author time, not discovered at execution. *(A ctx key colliding with a reserved
  expression namespace saved clean and silently read a different value at run
  time.)*

Two more are specific to the graph editor and live with it, in
[docs-md/workflows/MANUAL_TEST_PLAN.md](docs-md/workflows/MANUAL_TEST_PLAN.md):
rules are depth-independent (they hold inside inline child graphs), and wrappers
inherit affordances (a `pollUntil` gets the ports of the activity it wraps).

**Checks must be falsifiable.** Before trusting any check, state what you would
do to make it fail. If you cannot describe that state, it is a description, not
a check — and it will pass even if the feature is removed entirely. If you can
describe it but no fixture can produce it, the *fixture* is the gap: add a
workflow rather than weaken the check. `npm run workflows:lint:all` reports which
shapes the shipped collection cannot exercise.
