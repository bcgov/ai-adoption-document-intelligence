import type { LookupDef } from "../types";
import { customJson } from "./custom-json";
import { earliestAfter } from "./earliest-after";
import { exactMatch } from "./exact-match";
import { latestBefore } from "./latest-before";
import { multiFieldExact } from "./multi-field-exact";
import { rangeContains } from "./range-contains";
import type { LookupTemplate } from "./types";

export type { LookupTemplate } from "./types";

export const LOOKUP_TEMPLATES: LookupTemplate[] = [
  exactMatch,
  rangeContains,
  latestBefore,
  earliestAfter,
  multiFieldExact,
  customJson,
];

export function templateFor(lookup: LookupDef): LookupTemplate {
  if (lookup.templateId) {
    const t = LOOKUP_TEMPLATES.find((x) => x.id === lookup.templateId);
    if (t?.fromLookupDef(lookup)) return t;
  }
  for (const t of LOOKUP_TEMPLATES) {
    if (t.id !== "custom-json" && t.fromLookupDef(lookup)) return t;
  }
  return customJson;
}
