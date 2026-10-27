/**
 * Text and number inputs for settings fields that keep what is typed locally
 * and commit it after a quiet moment, on blur, or when the field unmounts.
 *
 * A settings field's commit replaces its node (or group) in the editor's
 * workflow config, which re-resolves bindings, re-validates and re-renders
 * the canvas. Committing once per editing burst rather than once per
 * keystroke keeps typing responsive on any size of graph. Both inputs are
 * built on `useDebouncedTextCommit`, which also recognises the parent's echo
 * of a value the field sent, so a late echo never overwrites newer typing.
 */

import {
  NumberInput,
  type NumberInputProps,
  TextInput,
  type TextInputProps,
} from "@mantine/core";
import { useDebouncedTextCommit } from "../../use-debounced-text-commit";

export interface DebouncedTextInputProps
  extends Omit<TextInputProps, "value" | "defaultValue" | "onChange"> {
  /** The committed value. A change from outside replaces the draft. */
  value: string;
  /** Receives the typed text once typing pauses, on blur, or on unmount. */
  onCommit: (next: string) => void;
}

export function DebouncedTextInput({
  value,
  onCommit,
  onBlur,
  ...inputProps
}: DebouncedTextInputProps) {
  const { draft, setDraft, flush } = useDebouncedTextCommit(value, onCommit);
  return (
    <TextInput
      {...inputProps}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}

/**
 * The number a draft holds, or `undefined` when the box is empty or holds
 * something that is not a number yet (a lone minus sign, for example).
 */
function readNumberDraft(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * What the Mantine input renders for a draft: the number itself when the
 * draft is plainly that number, so the input's own min/max handling applies,
 * and the raw text otherwise, so a half-typed value such as `1.` survives.
 */
function numberInputValue(draft: string): number | string {
  const parsed = readNumberDraft(draft);
  return parsed !== undefined && String(parsed) === draft ? parsed : draft;
}

export interface DebouncedNumberInputProps
  extends Omit<NumberInputProps, "value" | "defaultValue" | "onChange"> {
  /** The committed value; `undefined` when unset. */
  value: number | undefined;
  /**
   * Receives the typed number once typing pauses, on blur, or on unmount:
   * `undefined` when the box is empty or does not hold a number. The caller
   * decides whether that clears the setting or is ignored.
   */
  onCommit: (next: number | undefined) => void;
}

export function DebouncedNumberInput({
  value,
  onCommit,
  onBlur,
  ...inputProps
}: DebouncedNumberInputProps) {
  const { draft, setDraft, flush } = useDebouncedTextCommit(
    value === undefined ? "" : String(value),
    (text) => onCommit(readNumberDraft(text)),
  );
  return (
    <NumberInput
      {...inputProps}
      value={numberInputValue(draft)}
      onChange={(next) =>
        setDraft(typeof next === "number" ? String(next) : next)
      }
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}
