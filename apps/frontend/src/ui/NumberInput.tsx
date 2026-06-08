import { NumberField as BcdsNumberField } from "@bcgov/design-system-react-components";
import type { CSSProperties, ReactNode } from "react";
import {
  fieldMarginStyle,
  isStringLabel,
  normalizeFieldError,
  pickFieldPassthrough,
} from "./formFieldUtils";

export interface AppNumberInputProps {
  label?: ReactNode;
  description?: ReactNode;
  value?: number | string;
  defaultValue?: number | string;
  onChange?: (value: number | string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  required?: boolean;
  error?: ReactNode | boolean;
  hideControls?: boolean;
  size?: "xs" | "sm" | "md" | "small" | "medium";
  mt?: string | number;
  mb?: string | number;
  style?: CSSProperties;
  [key: string]: unknown;
}

function toNumber(value: number | string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * BC DS `NumberField` with Mantine `NumberInput`-compatible props.
 */
export function NumberInput({
  label,
  description,
  value,
  defaultValue,
  onChange,
  min,
  max,
  step,
  disabled,
  required,
  error,
  size,
  mt,
  mb,
  style,
  ...rest
}: AppNumberInputProps) {
  const passthrough = pickFieldPassthrough(rest);
  const wrapperStyle: CSSProperties = { ...fieldMarginStyle(mt, mb), ...style };
  const numericValue = toNumber(value ?? defaultValue);

  return (
    <div className="bcds-form-field" style={wrapperStyle}>
      <BcdsNumberField
        {...passthrough}
        size={
          size === "xs" || size === "sm" || size === "small"
            ? "small"
            : "medium"
        }
        label={isStringLabel(label) ? label : undefined}
        description={typeof description === "string" ? description : undefined}
        errorMessage={normalizeFieldError(error)}
        value={numericValue}
        minValue={min}
        maxValue={max}
        step={step}
        isDisabled={disabled}
        isRequired={required}
        onChange={(next) => {
          const parsed = toNumber(next);
          if (parsed != null) onChange?.(parsed);
        }}
      />
    </div>
  );
}
