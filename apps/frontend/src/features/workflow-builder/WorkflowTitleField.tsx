/**
 * The workflow's name, as a click-to-edit title (P-3 / ruling R-2, 2026-08-03).
 *
 * It used to be a labelled `TextInput` in the top bar. A name is read a
 * hundred times for every time it is written, so a permanent form field spent
 * ~280px and — because its label sits *above* it — set the height of the whole
 * bar, which is what stopped the top bar from having a single baseline. As a
 * title it costs one line of text until somebody clicks it.
 *
 * Commit rules: Enter or blur commits the trimmed value, Escape reverts. An
 * empty value is NOT a rename — the previous name is restored, because this
 * title is now the only place the name is shown and a blank one leaves nothing
 * to click back into. (`handleSave` still coerces a blank name to "Untitled
 * workflow"; that is the persistence rule, this is the editing surface.)
 */

import { Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { useState } from "react";

interface WorkflowTitleFieldProps {
  /** The committed name. */
  value: string;
  /** Called with the trimmed new name; never called with an empty string. */
  onChange: (next: string) => void;
}

export function WorkflowTitleField({
  value,
  onChange,
}: WorkflowTitleFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === value) return;
    onChange(trimmed);
  };

  if (editing) {
    return (
      <TextInput
        // The accessible name stays "Name" — it is what the field has always
        // announced, and the undo/redo hotkeys deliberately stand down while
        // focus is inside it so native text undo still works.
        aria-label="Name"
        data-testid="workflow-title-input"
        value={draft}
        size="xs"
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={{ width: 260 }}
      />
    );
  }

  return (
    <Tooltip label="Click to rename" withArrow>
      <UnstyledButton
        onClick={startEditing}
        data-testid="workflow-title"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          maxWidth: 260,
          borderRadius: 4,
          padding: "2px 6px",
        }}
      >
        <Text fw={600} size="sm" truncate="end">
          {value}
        </Text>
        <IconPencil size={13} opacity={0.55} style={{ flexShrink: 0 }} />
      </UnstyledButton>
    </Tooltip>
  );
}
