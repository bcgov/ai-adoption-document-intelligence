import { CorrectionAction } from "../../core/types/annotation";

interface PageCorrection {
  field_key: string;
  corrected_value?: string;
  action: CorrectionAction;
}

interface SavedCorrection {
  fieldKey: string;
  correctedValue?: string;
}

/**
 * The corrections on the review page that still need saving.
 *
 * A reopened session, or one taken over from another reviewer, opens with its
 * saved corrections already on the page. Sending those again would store each
 * one twice and credit the copy to whoever sent it, so a field goes out only
 * when its value differs from the field's last saved correction.
 *
 * @param onPage - The page's corrections, keyed by field.
 * @param saved - The session's saved corrections, oldest first.
 * @returns The corrected fields to save.
 */
export function unsavedCorrections<T extends PageCorrection>(
  onPage: Record<string, T>,
  saved: ReadonlyArray<SavedCorrection>,
): T[] {
  const lastSaved = new Map<string, string | undefined>();
  for (const correction of saved) {
    lastSaved.set(correction.fieldKey, correction.correctedValue);
  }
  return Object.values(onPage).filter(
    (correction) =>
      correction.action === CorrectionAction.CORRECTED &&
      !(
        lastSaved.has(correction.field_key) &&
        lastSaved.get(correction.field_key) === correction.corrected_value
      ),
  );
}
