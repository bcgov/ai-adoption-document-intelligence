/**
 * Loads the repo-root .env before any other module reads process.env.
 *
 * Imported for side effects; must be the FIRST import in the entry point
 * so env is populated before any other module reads process.env at import time.
 */

import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";

// Root-level .env (monorepo root, two levels up from apps/temporal)
dotenvConfig({ path: resolve(__dirname, "../../../.env"), quiet: true });
