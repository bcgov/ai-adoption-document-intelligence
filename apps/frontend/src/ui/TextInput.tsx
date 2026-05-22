import { TextField as BcdsTextField } from "@bcgov/design-system-react-components";
import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from "react";
import {
  emitInputChange,
  fieldMarginStyle,
  isStringLabel,
  normalizeFieldError,
  pickFieldPassthrough,
} from "./formFieldUtils";

export interface AppTextInputProps {
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  error?: ReactNode | boolean;
  disabled?: boolean;
  required?: boolean;
  withAsterisk?: boolean;
  type?: string;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  size?: "xs" | "sm" | "md" | "lg" | "small" | "medium";
  mt?: string | number;
  mb?: string | number;
  style?: CSSProperties;
  className?: string;
  [key: string]: unknown;
}

function mapInputSize(
  size: AppTextInputProps["size"],
): "small" | "medium" | undefined {
  if (size === "xs" || size === "sm" || size === "small") return "small";
  return "medium";
}

/**
 * BC DS `TextField` with Mantine `TextInput`-compatible props.
 */
export function TextInput({
  label,
  description,
  placeholder,
  value,
  defaultValue,
  onChange,
  onBlur,
  onKeyDown,
  error,
  disabled,
  required,
  withAsterisk,
  type = "text",
  leftSection,
  rightSection,
  size,
  mt,
  mb,
  style,
  className,
  ...rest
}: AppTextInputProps) {
  const passthrough = pickFieldPassthrough(rest);
  const wrapperStyle: CSSProperties = {
    ...fieldMarginStyle(mt, mb),
    ...style,
  };
  const errorMessage = normalizeFieldError(error);
  const isRequired = required ?? withAsterisk;
  const descriptionText =
    typeof description === "string" ? description : undefined;

  const fieldProps = {
    ...passthrough,
    ...(placeholder ? { placeholder } : {}),
    ...(onBlur ? { onBlur } : {}),
    ...(onKeyDown ? { onKeyDown } : {}),
  };

  const field = (
    <BcdsTextField
      {...(fieldProps as Parameters<typeof BcdsTextField>[0])}
      className={className}
      size={mapInputSize(size)}
      label={isStringLabel(label) ? label : undefined}
      description={descriptionText}
      errorMessage={errorMessage}
      type={type}
      value={
        value != null
          ? String(value)
          : defaultValue != null
            ? String(defaultValue)
            : ""
      }
      onChange={(next) => emitInputChange(next, onChange)}
      onBlur={onBlur}
      isDisabled={disabled}
      isRequired={isRequired}
      iconLeft={
        leftSection && typeof leftSection === "object"
          ? (leftSection as React.ReactElement)
          : undefined
      }
      iconRight={
        rightSection && typeof rightSection === "object"
          ? (rightSection as React.ReactElement)
          : undefined
      }
    />
  );

  if (!isStringLabel(label) && label != null) {
    return (
      <div className="bcds-form-field" style={wrapperStyle}>
        <div className="bcds-form-field-custom-label">{label}</div>
        {field}
      </div>
    );
  }

  return (
    <div className="bcds-form-field" style={wrapperStyle}>
      {field}
    </div>
  );
}
