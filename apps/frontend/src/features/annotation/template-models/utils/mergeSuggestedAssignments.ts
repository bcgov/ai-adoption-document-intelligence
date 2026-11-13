export interface SuggestedAssignment {
  field_key: string;
  element_ids: string[];
}

export interface MergedAssignments {
  /** Element id to field key, after the merge. */
  assignments: Record<string, string>;
  /** Fields that gained words from the suggestions. */
  filled: number;
  /** Suggested fields left alone because the user had already labelled them. */
  kept: number;
}

/**
 * Adds suggested words to the current word-to-field assignments without
 * touching the user's own work: a field that already has words keeps them,
 * and a word already given to any field stays where it is. Suggestions can
 * arrive tens of seconds after the document opens, so anything labelled by
 * hand in the meantime must survive them.
 */
export function mergeSuggestedAssignments(
  current: Record<string, string>,
  suggestions: SuggestedAssignment[],
  knownElementIds: ReadonlySet<string>,
): MergedAssignments {
  const assignments = { ...current };
  const labelledFields = new Set(Object.values(current));
  let filled = 0;
  let kept = 0;

  for (const suggestion of suggestions) {
    if (labelledFields.has(suggestion.field_key)) {
      kept += 1;
      continue;
    }
    let gained = false;
    for (const elementId of suggestion.element_ids) {
      if (!knownElementIds.has(elementId) || assignments[elementId]) continue;
      assignments[elementId] = suggestion.field_key;
      gained = true;
    }
    if (gained) filled += 1;
  }

  return { assignments, filled, kept };
}
