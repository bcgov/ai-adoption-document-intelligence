import { TextArea as BcdsTextArea } from "@bcgov/design-system-react-components";
import type { ChangeEvent, CSSProperties, FocusEvent, ReactNode } from "react";
import {
  emitTextareaChange,
  fieldMarginStyle,
  isStringLabel,
  normalizeFieldError,
  pickFieldPassthrough,
  resolveFieldAriaLabel,
} from "./formFieldUtils";

export interface AppTextareaProps {
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  error?: ReactNode | boolean;
  disabled?: boolean;
  required?: boolean;
  withAsterisk?: boolean;
  minRows?: number;
  maxRows?: number;
  autosize?: boolean;
  mt?: string | number;
  mb?: string | number;
  style?: CSSProperties;
  styles?: { input?: CSSProperties };
  className?: string;
  [key: string]: unknown;
}

/**
 * BC DS `TextArea` with Mantine `Textarea`-compatible props.
 */
export function Textarea({
  label,
  description,
  placeholder,
  value,
  defaultValue,
  onChange,
  onBlur,
  error,
  disabled,
  required,
  withAsterisk,
  minRows = 3,
  maxRows,
  mt,
  mb,
  style,
  styles,
  className,
  ...rest
}: AppTextareaProps) {
  const passthrough = pickFieldPassthrough(rest);
  const wrapperStyle: CSSProperties = {
    ...fieldMarginStyle(mt, mb),
    ...style,
  };
  const errorMessage = normalizeFieldError(error);
  const descriptionText =
    typeof description === "string" ? description : undefined;
  const ariaLabel = resolveFieldAriaLabel(label, placeholder, passthrough);

  const fieldProps = {
    ...passthrough,
    ...(placeholder ? { placeholder } : {}),
    ...(onBlur ? { onBlur } : {}),
  };

  const field = (
    <BcdsTextArea
      {...(fieldProps as Parameters<typeof BcdsTextArea>[0])}
      className={className}
      label={isStringLabel(label) ? label : undefined}
      description={descriptionText}
      errorMessage={errorMessage}
      value={value ?? defaultValue ?? ""}
      aria-label={ariaLabel}
      onChange={(next) => emitTextareaChange(next, onChange)}
      isDisabled={disabled}
      isRequired={required ?? withAsterisk}
      style={{
        minHeight: `${minRows * 1.5}rem`,
        maxHeight: maxRows ? `${maxRows * 1.5}rem` : undefined,
        ...(styles?.input ?? {}),
      }}
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
