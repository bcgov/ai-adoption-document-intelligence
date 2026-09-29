/**
 * Thin Mantine `<Select>` wrapper that renders the typed-I/O Kind picker
 * used by the workflow-settings drawer's ctx rows (US-098) and by the
 * library-port editor (US-099).
 *
 * Encapsulates the wildcard-sentinel translation so callers can deal in
 * `KindRef | undefined` directly — `undefined` means "no kind declared",
 * which renders as the leading "—" option. See `kind-select-options.ts`
 * for the option-building / value-translation helpers.
 */

import type { KindRef } from "@ai-di/graph-workflow";
import { Select, type SelectProps } from "@mantine/core";
import {
  buildKindSelectOptions,
  kindRefToSelectValue,
  selectValueToKindRef,
} from "./kind-select-options";

export interface KindSelectProps
  extends Omit<SelectProps, "value" | "onChange" | "data"> {
  value: KindRef | undefined;
  onChange: (value: KindRef | undefined) => void;
}

export function KindSelect({
  value,
  onChange,
  searchable = true,
  ...rest
}: KindSelectProps) {
  return (
    <Select
      data={buildKindSelectOptions()}
      value={kindRefToSelectValue(value)}
      onChange={(next) => onChange(selectValueToKindRef(next))}
      searchable={searchable}
      allowDeselect={false}
      {...rest}
    />
  );
}
