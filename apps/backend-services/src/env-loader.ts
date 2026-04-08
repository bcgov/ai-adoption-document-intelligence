/**
 * Env loader with external override support.
 *
 * Load order (first wins — dotenv never overwrites already-set vars):
 *   1. External override file (sensitive secrets, outside the repo).
 *      Path: $DI_SECRETS_DIR/backend-services.env
 *            (default $DI_SECRETS_DIR = ~/.config/bcgov-di)
 *   2. Repo-local ./.env (non-sensitive defaults, shared with other devs).
 *
 * Imported for side effects; must be the FIRST import in the entry point
 * so env is populated before any other module reads process.env at import time.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";

const APP_NAME = "backend-services";
const overrideDir =
  process.env.DI_SECRETS_DIR ?? resolve(homedir(), ".config/bcgov-di");
const overridePath = resolve(overrideDir, `${APP_NAME}.env`);
if (existsSync(overridePath)) {
  dotenvConfig({ path: overridePath, quiet: true });
}
dotenvConfig({ quiet: true });
