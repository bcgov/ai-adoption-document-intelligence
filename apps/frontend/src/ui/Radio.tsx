import {
  Radio as BcdsRadio,
  RadioGroup as BcdsRadioGroup,
} from "@bcgov/design-system-react-components";
import type { ReactNode } from "react";
import { pickFieldPassthrough } from "./formFieldUtils";

export interface AppRadioProps {
  value: string;
  label?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
  [key: string]: unknown;
}

export interface AppRadioGroupProps {
  label?: ReactNode;
  description?: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  children?: ReactNode;
  error?: ReactNode | boolean;
  [key: string]: unknown;
}

function RadioOption({ value, label, disabled, ...rest }: AppRadioProps) {
  const passthrough = pickFieldPassthrough(rest);
  return (
    <BcdsRadio {...passthrough} value={value} isDisabled={disabled}>
      {label ?? rest.children}
    </BcdsRadio>
  );
}

function RadioGroupComponent({
  label,
  description,
  value,
  defaultValue,
  onChange,
  children,
  error,
  ...rest
}: AppRadioGroupProps) {
  const passthrough = pickFieldPassthrough(rest);
  const descriptionText =
    typeof description === "string" ? description : undefined;

  return (
    <BcdsRadioGroup
      {...passthrough}
      label={typeof label === "string" ? label : undefined}
      description={descriptionText}
      value={value ?? defaultValue}
      onChange={(next) => onChange?.(next)}
      errorMessage={
        typeof error === "string"
          ? error
          : error === true
            ? "Invalid"
            : undefined
      }
    >
      {children}
    </BcdsRadioGroup>
  );
}

export const Radio = Object.assign(RadioOption, {
  Group: RadioGroupComponent,
});
