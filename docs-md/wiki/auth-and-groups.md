---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/AUTHENTICATION.md
  - docs-md/GROUP_RESOURCE_AUTHORIZATION.md
  - docs-md/group/
  - apps/backend-services/src/auth/
  - apps/backend-services/src/group/
  - apps/frontend/src/auth/
do_not_duplicate:
  - Secret values
  - Full auth setup runbooks
  - Endpoint-by-endpoint authorization tables
  - Keycloak configuration dumps
---

# Auth and Groups

The platform supports interactive authentication through Keycloak/OIDC and programmatic access through API keys. Groups provide the main resource ownership and scoping boundary for many user-facing workflows.

## Source Map

- Authentication details live in `docs-md/AUTHENTICATION.md`.
- Group-scoped authorization behavior lives in `docs-md/GROUP_RESOURCE_AUTHORIZATION.md`.
- Group UI and workflow context docs live under `docs-md/group/`.
- Backend auth implementation, including API key guards, lives in `apps/backend-services/src/auth/`.
- Group backend behavior lives in `apps/backend-services/src/group/`.
- Frontend auth context lives in `apps/frontend/src/auth/`.

## Design Notes

- Do not expose or copy secret values into wiki pages.
- Treat group authorization docs as the stable policy reference before changing access checks.
- API keys and OIDC users have different entrypoints but must converge on clear actor and authorization behavior.

## Common Drift Risks

- Frontend group context can drift from backend group membership and authorization checks.
- Documentation for group management pages can become endpoint-level; keep detailed API behavior in canonical docs or Swagger/OpenAPI.
- Local development auth shortcuts should not leak into production-oriented guidance.
