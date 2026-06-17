import { Checkbox as BcdsCheckbox } from "@bcgov/design-system-react-components";
import type { ChangeEvent, MouseEventHandler, ReactNode } from "react";
import { pickFieldPassthrough } from "./formFieldUtils";

export interface AppCheckboxProps {
  label?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onClick?: MouseEventHandler<HTMLSpanElement>;
  error?: ReactNode | boolean;
  [key: string]: unknown;
}

export function Checkbox({
  label,
  checked,
  defaultChecked,
  indeterminate,
  disabled,
  onChange,
  onClick,
  ...rest
}: AppCheckboxProps) {
  const passthrough = pickFieldPassthrough(rest);
  const isSelected = checked ?? defaultChecked ?? false;

  return (
    <span onClick={onClick} style={{ display: "inline-flex" }}>
      <BcdsCheckbox
        {...passthrough}
        isSelected={isSelected}
        isIndeterminate={indeterminate}
        isDisabled={disabled}
        onChange={(selected) => {
          onChange?.({
            currentTarget: { checked: selected },
            target: { checked: selected },
          } as ChangeEvent<HTMLInputElement>);
        }}
      >
        {label}
      </BcdsCheckbox>
    </span>
  );
}
