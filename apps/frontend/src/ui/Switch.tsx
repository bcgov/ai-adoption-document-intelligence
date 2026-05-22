import { Switch as BcdsSwitch } from "@bcgov/design-system-react-components";
import type { ChangeEvent, ReactNode } from "react";
import { pickFieldPassthrough } from "./formFieldUtils";

export interface AppSwitchProps {
  label?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onLabel?: ReactNode;
  offLabel?: ReactNode;
  [key: string]: unknown;
}

export function Switch({
  label,
  checked,
  defaultChecked,
  disabled,
  onChange,
  onLabel,
  offLabel,
  ...rest
}: AppSwitchProps) {
  const passthrough = pickFieldPassthrough(rest);
  const isSelected = checked ?? defaultChecked ?? false;
  const displayLabel = label ?? (isSelected ? onLabel : offLabel);

  return (
    <BcdsSwitch
      {...passthrough}
      isSelected={isSelected}
      isDisabled={disabled}
      onChange={(selected) => {
        onChange?.({
          currentTarget: { checked: selected },
          target: { checked: selected },
        } as ChangeEvent<HTMLInputElement>);
      }}
    >
      {displayLabel}
    </BcdsSwitch>
  );
}
