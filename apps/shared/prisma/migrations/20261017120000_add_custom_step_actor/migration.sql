-- Custom-step (dynamic node) runs call the platform API with an internal
-- token that carries no user, so the backend names their actor
-- `internal:dyn-run` (`internal:` + the token purpose the worker mints,
-- DYN_RUN_TOKEN_PURPOSE). Records that name an actor reference this table,
-- so that actor needs a row of its own.
INSERT INTO "actor" ("id") VALUES ('internal:dyn-run') ON CONFLICT ("id") DO NOTHING;
