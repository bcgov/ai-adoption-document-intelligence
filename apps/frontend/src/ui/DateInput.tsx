import { DatePicker as BcdsDatePicker } from "@bcgov/design-system-react-components";
import { parseDate } from "@internationalized/date";
import dayjs from "dayjs";
import type { CSSProperties, ReactNode } from "react";
import {
  fieldMarginStyle,
  isStringLabel,
  normalizeFieldError,
  pickFieldPassthrough,
} from "./formFieldUtils";

export interface AppDateInputProps {
  label?: ReactNode;
  description?: ReactNode;
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (value: Date | null) => void;
  valueFormat?: string;
  disabled?: boolean;
  required?: boolean;
  error?: ReactNode | boolean;
  mt?: string | number;
  mb?: string | number;
  style?: CSSProperties;
  [key: string]: unknown;
}

function dateToCalendarValue(date: Date | null | undefined) {
  if (date == null) return undefined;
  const formatted = dayjs(date).format("YYYY-MM-DD");
  return parseDate(formatted);
}

/**
 * BC DS `DatePicker` with Mantine `@mantine/dates` `DateInput`-compatible value API.
 */
export function DateInput({
  label,
  description,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  error,
  mt,
  mb,
  style,
  ...rest
}: AppDateInputProps) {
  const passthrough = pickFieldPassthrough(rest);
  const wrapperStyle: CSSProperties = { ...fieldMarginStyle(mt, mb), ...style };
  const calendarValue = dateToCalendarValue(value ?? defaultValue);

  return (
    <div className="bcds-form-field" style={wrapperStyle}>
      <BcdsDatePicker
        {...passthrough}
        label={isStringLabel(label) ? label : undefined}
        description={typeof description === "string" ? description : undefined}
        errorMessage={normalizeFieldError(error)}
        value={calendarValue}
        onChange={(next) => {
          if (next == null) {
            onChange?.(null);
            return;
          }
          onChange?.(dayjs(next.toString()).toDate());
        }}
        isDisabled={disabled}
        isRequired={required}
      />
    </div>
  );
}
