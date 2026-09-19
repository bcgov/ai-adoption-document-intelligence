import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CopyScore, type FieldListScore, totals } from "./score";

export interface LabelFormResult {
  formId: string;
  title: string;
  templateModelId: string;
  copies: number;
  failedOcr: number;
  failedCalls: number;
  medianLatencyMs: number | null;
  scores: CopyScore[];
}

export interface FieldFormResult {
  formId: string;
  title: string;
  templateModelId: string;
  latencyMs: number | null;
  error: string | null;
  score: FieldListScore | null;
}

interface RunInfo {
  name: string;
  engine: string;
  date: string;
  backendUrl: string;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function writeLabelReport(
  dir: string,
  run: RunInfo,
  results: LabelFormResult[],
): void {
  writeFileSync(
    join(dir, "labels-report.json"),
    JSON.stringify({ ...run, results }, null, 2),
  );
  const rows = results.map((r) => {
    const t = totals(r.scores);
    return `| ${r.formId} | ${r.copies} | ${t.verified} | ${t.exact} | ${t.partial} | ${t.wrong} | ${t.missed} | ${percent(t.exactRate)} | ${t.unverified} | ${r.failedOcr} | ${r.failedCalls} | ${r.medianLatencyMs ?? "—"} |`;
  });
  const all = totals(results.flatMap((r) => r.scores));
  const lines = [
    `# Suggested labels: ${run.name}`,
    "",
    `Engine: ${run.engine}. Date: ${run.date}. Backend: ${run.backendUrl}.`,
    "",
    "| Form | Copies | Verified fields | Exact | Partial | Wrong | Missed | Exact rate | Unverifiable | OCR failed | Call failed | Median ms |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    `| **All** | ${results.reduce((s, r) => s + r.copies, 0)} | ${all.verified} | ${all.exact} | ${all.partial} | ${all.wrong} | ${all.missed} | **${percent(all.exactRate)}** | ${all.unverified} | ${results.reduce((s, r) => s + r.failedOcr, 0)} | ${results.reduce((s, r) => s + r.failedCalls, 0)} | |`,
    "",
    "Exact: the suggested words are exactly the ground truth. Partial: they overlap it. Wrong: no overlap. Missed: no suggestion. Unverifiable fields (OCR did not read the value back) are left out.",
  ];
  writeFileSync(join(dir, "labels-report.md"), `${lines.join("\n")}\n`);
}

export function writeFieldReport(
  dir: string,
  run: RunInfo,
  results: FieldFormResult[],
): void {
  writeFileSync(
    join(dir, "fields-report.json"),
    JSON.stringify({ ...run, results }, null, 2),
  );
  const rows = results.map((r) =>
    r.score
      ? `| ${r.formId} | ${r.score.foundTextFields} / ${r.score.answerTextFields} | ${r.score.suggestedMatching} / ${r.score.suggestedWithValue} | ${r.score.suggestedCheckboxes} / ${r.score.answerCheckboxes} | ${r.latencyMs ?? "—"} |`
      : `| ${r.formId} | failed: ${r.error ?? "unknown"} | | | |`,
  );
  const lines = [
    `# Suggested fields: ${run.name}`,
    "",
    `Engine: ${run.engine}. Date: ${run.date}. Backend: ${run.backendUrl}.`,
    "",
    "| Form | Text fields found | Suggestions matching a real value | Checkboxes suggested / in form | ms |",
    "|---|---|---|---|---|",
    ...rows,
  ];
  writeFileSync(join(dir, "fields-report.md"), `${lines.join("\n")}\n`);
}
