import * as fs from "node:fs";
import * as path from "node:path";
import { getRegisteredActivityTypeKeys } from "../workflow/activity-registry";
import { RateVersionEntry } from "./rate-version.types";

/**
 * Guard: every registered non-benchmark, non-billing activity must have an
 * entry in the active rate version so that new activities cannot ship silently
 * free. Activities intentionally free are listed at units: 0.
 */
describe("rate-coverage", () => {
  it("every registered non-benchmark, non-billing activity has an entry in the active rate version", () => {
    const filePath = path.join(__dirname, "rate_versions.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const versions = JSON.parse(raw) as RateVersionEntry[];

    const now = new Date();
    const active = versions
      .filter((v) => new Date(v.effective_from) <= now)
      .sort(
        (a, b) =>
          new Date(b.effective_from).getTime() -
          new Date(a.effective_from).getTime(),
      )[0];

    expect(active).toBeDefined();

    const rateActivityNames = new Set(Object.keys(active.activity_costs));

    const uncovered = getRegisteredActivityTypeKeys()
      .filter((t) => !t.startsWith("benchmark.") && !t.startsWith("billing."))
      .filter((t) => !rateActivityNames.has(t));

    expect(uncovered).toEqual([]);
  });
});
