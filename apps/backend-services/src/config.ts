/**
 * This file is not ment to replace the ConfigService within Nest.
 * ConfigService cannot be used inside decorators, so this exists to provide access
 * to ENVs in those cases.
 */

import { join } from "path";

interface Config {
 STORAGE_PATH: string;
}

export const getConfig = (): Config => {
  return {
    STORAGE_PATH:
      process.env.STORAGE_PATH || join(process.cwd(), "storage", "documents"),
  };
};
