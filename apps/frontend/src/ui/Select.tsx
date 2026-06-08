import { Select as BcdsSelect } from "@bcgov/design-system-react-components";
import { Select as MantineSelect } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import {
  fieldMarginStyle,
  isStringLabel,
  normalizeFieldError,
  pickFieldPassthrough,
  resolveFieldAriaLabel,
} from "./formFieldUtils";
import { rem } from "./spacingUtils";

/** React Aria rejects empty string keys; map transparently at the adapter boundary. */
export const BCDS_EMPTY_SELECT_KEY = "__bcds_empty__";

export function toBcdsItemId(value: string): string {
  return value === "" ? BCDS_EMPTY_SELECT_KEY : value;
}

export function fromBcdsItemId(id: string | null | undefined): string | null {
  if (id == null) return null;
  return id === BCDS_EMPTY_SELECT_KEY ? "" : id;
}

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
      items.push({ id: toBcdsItemId(item), label: item });
    } else if ("group" in item) {
      for (const sub of item.items) {
        items.push({ id: toBcdsItemId(sub.value), label: sub.label });
      }
    } else {
      items.push({ id: toBcdsItemId(item.value), label: item.label });
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
        items: item.items.map((sub) => ({
          id: toBcdsItemId(sub.value),
          label: sub.label,
        })),
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

function mapMantineSelectSize(
  size: AppSelectProps["size"],
): "xs" | "sm" | "md" | "lg" | undefined {
  if (size === "xs" || size === "small") return "xs";
  if (size === "sm") return "sm";
  if (size === "lg") return "lg";
  return "md";
}

function usesMantineSelectFallback(props: {
  searchable?: boolean;
  clearable?: boolean;
  nothingFoundMessage?: string;
  allowDeselect?: boolean;
}): boolean {
  return (
    props.searchable === true ||
    props.clearable === true ||
    props.nothingFoundMessage != null ||
    props.allowDeselect === true
  );
}

/**
 * BC DS `Select` with Mantine `Select`-compatible `data` / `value` / `onChange`.
 * Falls back to Mantine `Select` when searchable/clearable (no BC DS equivalent).
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
  searchable,
  clearable,
  nothingFoundMessage,
  allowDeselect,
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
  const selectedKey = value ?? defaultValue ?? null;
  const descriptionText =
    typeof description === "string" ? description : undefined;
  const errorText = normalizeFieldError(error);

  if (
    usesMantineSelectFallback({
      searchable,
      clearable,
      nothingFoundMessage,
      allowDeselect,
    })
  ) {
    return (
      <MantineSelect
        {...passthrough}
        label={isStringLabel(label) ? label : undefined}
        description={descriptionText}
        placeholder={placeholder}
        data={dataList.map((item) =>
          typeof item === "string"
            ? item
            : "group" in item
              ? { group: item.group, items: [...item.items] }
              : item,
        )}
        value={selectedKey}
        onChange={onChange}
        error={errorText}
        disabled={disabled}
        required={required}
        searchable={searchable}
        clearable={clearable}
        nothingFoundMessage={nothingFoundMessage}
        allowDeselect={allowDeselect}
        size={mapMantineSelectSize(size)}
        w={w}
        mt={mt}
        mb={mb}
        style={style}
        className={className}
      />
    );
  }

  const sections = normalizeSections(dataList);
  const items = sections ? undefined : normalizeFlatItems(dataList);
  const fieldClassName = selectFieldClassName(fullWidth, w);
  const wrapperStyle: CSSProperties = {
    ...selectWrapperWidth(w, fullWidth),
    ...fieldMarginStyle(mt, mb),
    ...style,
  };
  const ariaLabel = resolveFieldAriaLabel(label, placeholder, passthrough);
  const bcdsSelectedKey =
    selectedKey != null && selectedKey !== ""
      ? toBcdsItemId(selectedKey)
      : selectedKey === ""
        ? toBcdsItemId("")
        : undefined;

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
      selectedKey={bcdsSelectedKey}
      onSelectionChange={(key) =>
        onChange?.(fromBcdsItemId(key as string | null))
      }
      isDisabled={disabled}
      isRequired={required}
      errorMessage={errorText}
      aria-label={ariaLabel}
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
