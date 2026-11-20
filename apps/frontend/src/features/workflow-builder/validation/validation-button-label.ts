/**
 * Label + severity for the top-bar validation button.
 *
 * Extracted so the severity split is testable without mounting the whole
 * editor page. It exists because the button used to render
 * `errorCount + warningCount` as one red "N issues" (G-097): one error and
 * five warnings read "6 issues" in red, and the split was only recoverable by
 * opening the drawer. Every other surface — the per-node buckets, the node
 * badge — keeps the two counts apart.
 */
export type ValidationTone = "red" | "yellow" | "green";

export interface ValidationButtonState {
  tone: ValidationTone;
  label: string;
}

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

export function validationButtonState(
  errorCount: number,
  warningCount: number,
): ValidationButtonState {
  if (errorCount > 0) {
    return {
      tone: "red",
      label:
        warningCount > 0
          ? `${plural(errorCount, "error")} · ${plural(warningCount, "warning")}`
          : plural(errorCount, "error"),
    };
  }
  if (warningCount > 0) {
    return { tone: "yellow", label: plural(warningCount, "warning") };
  }
  return { tone: "green", label: "Valid" };
}
