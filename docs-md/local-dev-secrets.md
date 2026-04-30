# Local Dev Secrets: External Override for `.env`

## Why

`.env` files in the repo are convenient for local development but leak easily —
AI coding assistants and tools launched from the project directory can read them
before any deny rule applies. To keep sensitive keys out of reach while still
letting other developers use a regular `./.env` for non-sensitive defaults,
`backend-services` and `temporal` now load env vars from **two layers**:

1. **External override file** (sensitive, outside the repo) — loaded first.
2. **Repo-local `./.env`** (non-sensitive defaults) — fills gaps only.

`dotenv` never overwrites variables that are already set, so anything defined
in the override file wins; anything missing falls back to the repo `.env`.

## Paths

| App                | Override file                                  |
| ------------------ | ---------------------------------------------- |
| `backend-services` | `$DI_SECRETS_DIR/backend-services.env`         |
| `temporal`         | `$DI_SECRETS_DIR/temporal.env`                 |

`DI_SECRETS_DIR` defaults to `~/.config/bcgov-di`.

## Setup

```bash
mkdir -p ~/.config/bcgov-di
chmod 700 ~/.config/bcgov-di

# Move sensitive keys out of apps/backend-services/.env into:
$EDITOR ~/.config/bcgov-di/backend-services.env
chmod 600 ~/.config/bcgov-di/backend-services.env

# Same for temporal:
$EDITOR ~/.config/bcgov-di/temporal.env
chmod 600 ~/.config/bcgov-di/temporal.env
```

Keep **non-sensitive** defaults (ports, feature flags, local URLs) in the repo
`./.env` files so other developers can still clone and run the apps without
extra setup.

## Opting out

Developers who don't want the override layer simply don't create the external
files — the loader silently falls through to the repo `.env`, preserving the
previous behaviour.

## Custom location

Set `DI_SECRETS_DIR` to override the default directory (e.g. to point at a
mounted 1Password or Vault-rendered directory):

```bash
export DI_SECRETS_DIR=/run/secrets/bcgov-di
```

## Implementation

- [apps/backend-services/src/env-loader.ts](../apps/backend-services/src/env-loader.ts)
- [apps/temporal/src/env-loader.ts](../apps/temporal/src/env-loader.ts)

Each entry point imports `./env-loader` as its first import so `process.env` is
populated before any other module reads it (decorators, top-level consts, etc.):

- [apps/backend-services/src/main.ts](../apps/backend-services/src/main.ts)
- [apps/temporal/src/worker.ts](../apps/temporal/src/worker.ts)
- [apps/temporal/src/activities.ts](../apps/temporal/src/activities.ts)

## Feature flags

| Variable | Default | Description |
|---|---|---|
| `ENABLE_CLASSIFIER_ORPHAN_CLEANUP` | `false` (unset) | Set to `true` to enable the weekly cron job that removes orphaned Azure DI classifier models and their blob storage files (i.e. models that exist in Azure DI but have no corresponding database record). Safe to leave disabled in local dev. |
