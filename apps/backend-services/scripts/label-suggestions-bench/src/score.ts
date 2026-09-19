import type { BenchLabelSuggestion, BenchSuggestedField } from "./api";
import type { AnswerKey } from "./fill";
import { normalizeText, type TruthField } from "./ground-truth";

export type Outcome = "exact" | "partial" | "wrong" | "missed";

export interface CopyScore {
  copy: string;
  verifiedFields: number;
  unverifiedFields: number;
  fields: Array<{ key: string; outcome: Outcome }>;
}

export function scoreCopy(
  copy: string,
  truth: TruthField[],
  suggestions: BenchLabelSuggestion[],
): CopyScore {
  const byKey = new Map(
    suggestions.map((s) => [s.field_key, new Set(s.element_ids)]),
  );
  const fields: CopyScore["fields"] = [];
  let unverified = 0;
  for (const field of truth) {
    if (!field.verified) {
      unverified += 1;
      continue;
    }
    const suggested = byKey.get(field.key);
    if (!suggested || suggested.size === 0) {
      fields.push({ key: field.key, outcome: "missed" });
      continue;
    }
    const exact = field.alternatives.some(
      (ids) =>
        ids.length === suggested.size && ids.every((id) => suggested.has(id)),
    );
    const overlaps = field.alternatives.some((ids) =>
      ids.some((id) => suggested.has(id)),
    );
    fields.push({
      key: field.key,
      outcome: exact ? "exact" : overlaps ? "partial" : "wrong",
    });
  }
  return {
    copy,
    verifiedFields: fields.length,
    unverifiedFields: unverified,
    fields,
  };
}

export interface Totals {
  verified: number;
  unverified: number;
  exact: number;
  partial: number;
  wrong: number;
  missed: number;
  exactRate: number;
}

export function totals(scores: CopyScore[]): Totals {
  const count = (outcome: Outcome) =>
    scores.reduce(
      (sum, score) =>
        sum + score.fields.filter((f) => f.outcome === outcome).length,
      0,
    );
  const verified = scores.reduce((sum, s) => sum + s.verifiedFields, 0);
  const exact = count("exact");
  return {
    verified,
    unverified: scores.reduce((sum, s) => sum + s.unverifiedFields, 0),
    exact,
    partial: count("partial"),
    wrong: count("wrong"),
    missed: count("missed"),
    exactRate: verified === 0 ? 0 : exact / verified,
  };
}

export interface FieldListScore {
  answerTextFields: number;
  foundTextFields: number;
  suggestedWithValue: number;
  suggestedMatching: number;
  answerCheckboxes: number;
  suggestedCheckboxes: number;
}

export function scoreFieldList(
  answers: AnswerKey,
  suggested: BenchSuggestedField[],
): FieldListScore {
  const truthValues = answers.fields
    .filter((field) => field.type === "string")
    .map((field) => normalizeText(field.value));
  const suggestedValues = suggested.flatMap((field) =>
    field.field_type !== "selectionMark" && field.value !== null
      ? [normalizeText(field.value)]
      : [],
  );
  return {
    answerTextFields: truthValues.length,
    foundTextFields: truthValues.filter((v) => suggestedValues.includes(v))
      .length,
    suggestedWithValue: suggestedValues.length,
    suggestedMatching: suggestedValues.filter((v) => truthValues.includes(v))
      .length,
    answerCheckboxes: answers.fields.filter((f) => f.type === "selectionMark")
      .length,
    suggestedCheckboxes: suggested.filter(
      (f) => f.field_type === "selectionMark",
    ).length,
  };
}
