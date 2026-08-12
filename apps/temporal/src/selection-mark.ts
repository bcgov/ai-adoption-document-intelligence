/**
 * Canonical representation for selection-mark (checkbox) field values.
 *
 * Canonical form everywhere in the app is the plain `"selected"` /
 * `"unselected"` string that `extractAzureFieldDisplayValue` already emits
 * for runtime predictions. The ONE exception is the Azure DI *labelling*
 * export boundary (`template-model.service.ts`'s `exportTemplateModel` for
 * `ExportFormat.AZURE`), which must keep writing Azure's tagged
 * `:selected:` / `:unselected:` syntax — that's a hard requirement of the
 * Azure DI custom-model labelling file format, not a stylistic choice.
 *
 * Ground truth derived from that labelling export (or otherwise authored
 * using the tagged form) therefore needs to be converted back to the plain
 * canonical form before it's compared against predictions. Use
 * `canonicalizeSelectionMarkValue` / `normalizeSelectionMarksDeep` at the
 * point ground truth is read for evaluation.
 *
 * See docs-md/extraction/SDPR_V2_WORKFLOW_ALIGNMENT.md, "P5 checkbox
 * representation".
 */

/**
 * Convert Azure's tagged selection-mark syntax to the plain canonical form.
 * `:selected:` -> `selected`, `:unselected:` -> `unselected`. Any other
 * value (including values that are already plain) passes through unchanged.
 */
export function canonicalizeSelectionMarkValue(value: string): string {
  if (value === ":selected:") return "selected";
  if (value === ":unselected:") return "unselected";
  return value;
}

/**
 * Recursively canonicalize selection-mark values throughout a ground truth
 * value tree — scalars, one-of alternate arrays, nested objects, and arrays
 * of row objects are all walked. Only exact `:selected:` / `:unselected:`
 * string matches are rewritten; every other value (including unrelated
 * strings, numbers, booleans, and null) passes through unchanged, so it's
 * safe to apply unconditionally to an entire loaded ground truth document.
 */
export function normalizeSelectionMarksDeep<T>(value: T): T {
  if (typeof value === "string") {
    return canonicalizeSelectionMarkValue(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizeSelectionMarksDeep(item),
    ) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = normalizeSelectionMarksDeep(entry);
    }
    return out as T;
  }
  return value;
}
