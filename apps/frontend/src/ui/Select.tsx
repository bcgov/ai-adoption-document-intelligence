import { Select as BcdsSelect } from "@bcgov/design-system-react-components";
import type { CSSProperties, ReactNode } from "react";
import {
  fieldMarginStyle,
  isStringLabel,
  normalizeFieldError,
  pickFieldPassthrough,
} from "./formFieldUtils";
import { rem } from "./spacingUtils";

export type SelectDataItem =
  | string
  | { value: string; label: string; disabled?: boolean }
  | {
      group: string;
      items:
        | readonly { value: string; label: string }[]
        | { value: string; label: string }[];
    };

export interface AppSelectProps {
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  data?: readonly SelectDataItem[] | SelectDataItem[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  error?: ReactNode | boolean;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  nothingFoundMessage?: string;
  allowDeselect?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "small" | "medium";
  /** Mantine width — number is px (e.g. `w={200}` → 200px) */
  w?: number | string;
  /** Stretch to parent width (form fields) */
  fullWidth?: boolean;
  mt?: string | number;
  mb?: string | number;
  style?: CSSProperties;
  className?: string;
  [key: string]: unknown;
}

function selectFieldClassName(
  fullWidth?: boolean,
  w?: number | string,
): string {
  const base = "bcds-form-field";
  if (fullWidth) {
    return `${base} bcds-form-field--full-width`;
  }
  if (w != null) {
    return base;
  }
  return `${base} bcds-form-field--fit`;
}

function selectWrapperWidth(
  w?: number | string,
  fullWidth?: boolean,
): CSSProperties | undefined {
  if (fullWidth) {
    return { width: "100%" };
  }
  if (w == null) {
    return undefined;
  }
  return { width: typeof w === "number" ? rem(w) : w };
}

function normalizeFlatItems(
  data: SelectDataItem[] | readonly SelectDataItem[],
) {
  const items: { id: string; label: string }[] = [];
  for (const item of data) {
    if (typeof item === "string") {
      items.push({ id: item, label: item });
    } else if ("group" in item) {
      for (const sub of item.items) {
        items.push({ id: sub.value, label: sub.label });
      }
    } else {
      items.push({ id: item.value, label: item.label });
    }
  }
  return items;
}

function normalizeSections(data: SelectDataItem[] | readonly SelectDataItem[]) {
  const sections: {
    id: string;
    header: string;
    items: { id: string; label: string }[];
  }[] = [];
  for (const item of data) {
    if (typeof item === "object" && item !== null && "group" in item) {
      sections.push({
        id: item.group,
        header: item.group,
        items: item.items.map((sub) => ({ id: sub.value, label: sub.label })),
      });
    }
  }
  return sections.length > 0 ? sections : undefined;
}

function mapSelectSize(
  size: AppSelectProps["size"],
): "small" | "medium" | undefined {
  if (size === "xs" || size === "sm" || size === "small") return "small";
  return "medium";
}

/**
 * BC DS `Select` with Mantine `Select`-compatible `data` / `value` / `onChange`.
 */
export function Select({
  label,
  description,
  placeholder,
  data,
  value,
  defaultValue,
  onChange,
  error,
  disabled,
  required,
  size,
  w,
  fullWidth,
  mt,
  mb,
  style,
  className,
  ...rest
}: AppSelectProps) {
  const passthrough = pickFieldPassthrough(rest);
  const dataList = data ?? [];
  const sections = normalizeSections(dataList);
  const items = sections ? undefined : normalizeFlatItems(dataList);
  const selectedKey = value ?? defaultValue ?? null;
  const fieldClassName = selectFieldClassName(fullWidth, w);
  const wrapperStyle: CSSProperties = {
    ...selectWrapperWidth(w, fullWidth),
    ...fieldMarginStyle(mt, mb),
    ...style,
  };
  const descriptionText =
    typeof description === "string" ? description : undefined;

  const field = (
    <BcdsSelect
      {...passthrough}
      className={className}
      size={mapSelectSize(size)}
      label={isStringLabel(label) ? label : undefined}
      description={descriptionText}
      placeholder={placeholder}
      items={items}
      sections={sections}
      selectedKey={selectedKey ?? undefined}
      onSelectionChange={(key) => onChange?.((key as string) ?? null)}
      isDisabled={disabled}
      isRequired={required}
      errorMessage={normalizeFieldError(error)}
    />
  );

  if (!isStringLabel(label) && label != null) {
    return (
      <div className={fieldClassName} style={wrapperStyle}>
        <div className="bcds-form-field-custom-label">{label}</div>
        {field}
      </div>
    );
  }

  return (
    <div className={fieldClassName} style={wrapperStyle}>
      {field}
    </div>
  );
}
