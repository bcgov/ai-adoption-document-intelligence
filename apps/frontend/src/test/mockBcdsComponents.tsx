import type { CSSProperties, ReactNode } from "react";
import { vi } from "vitest";

type BcdsMocksState = ReturnType<typeof createBcdsMocksInternal>;

declare global {
  // eslint-disable-next-line no-var
  var __bcdsAdapterTestMocks: BcdsMocksState | undefined;
}

function createBcdsMocksInternal() {
  const mockBcdsButton = vi.fn(
    ({
      children,
      ...props
    }: {
      children?: ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button type="button" onClick={props.onClick as () => void} {...props}>
        {children}
      </button>
    ),
  );

  const mockBcdsLink = vi.fn(
    ({ children, href }: { children?: ReactNode; href?: string }) => (
      <a href={href}>{children}</a>
    ),
  );

  const mockBcdsText = vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ));

  const mockBcdsHeading = vi.fn(
    ({ children, slot }: { children?: ReactNode; slot?: string }) => (
      <span data-slot={slot}>{children}</span>
    ),
  );

  const mockBcdsSelect = vi.fn(
    ({
      items,
      selectedKey,
      onSelectionChange,
      label,
      "aria-label": ariaLabel,
    }: {
      items?: { id: string; label: string }[];
      selectedKey?: string;
      onSelectionChange?: (key: string | null) => void;
      label?: string;
      "aria-label"?: string;
    }) => (
      <div
        data-testid="bcds-select"
        data-label={label}
        data-aria-label={ariaLabel}
        data-selected-key={selectedKey}
      >
        {items?.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`select-option-${item.id}`}
            onClick={() => onSelectionChange?.(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    ),
  );

  const mockBcdsTextField = vi.fn(
    ({
      label,
      value,
      onChange,
      "aria-label": ariaLabel,
    }: {
      label?: string;
      value?: string;
      onChange?: (value: string) => void;
      "aria-label"?: string;
    }) => (
      <input
        data-testid="bcds-text-field"
        aria-label={ariaLabel ?? label}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
      />
    ),
  );

  const mockBcdsTextArea = vi.fn(
    ({
      label,
      value,
      onChange,
      "aria-label": ariaLabel,
      style,
    }: {
      label?: string;
      value?: string;
      onChange?: (value: string) => void;
      "aria-label"?: string;
      style?: CSSProperties;
    }) => (
      <textarea
        data-testid="bcds-text-area"
        aria-label={ariaLabel ?? label}
        value={value ?? ""}
        style={style}
        onChange={(e) => onChange?.(e.target.value)}
      />
    ),
  );

  const mockBcdsModal = vi.fn(({ children }: { children?: ReactNode }) => (
    <div data-testid="bcds-modal">{children}</div>
  ));

  const mockBcdsDialog = vi.fn(
    ({
      children,
      "aria-label": ariaLabel,
    }: {
      children?: ReactNode;
      "aria-label"?: string;
    }) => (
      <div data-testid="bcds-dialog" aria-label={ariaLabel}>
        {children}
      </div>
    ),
  );

  const mockBcdsInlineAlert = vi.fn(
    ({ variant, title }: { variant?: string; title?: string }) => (
      <div data-testid="bcds-inline-alert" data-variant={variant}>
        {title}
      </div>
    ),
  );

  const mockBcdsCheckbox = vi.fn(
    ({
      children,
      isSelected,
      onChange,
    }: {
      children?: ReactNode;
      isSelected?: boolean;
      onChange?: (selected: boolean) => void;
    }) => (
      <label>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        {children}
      </label>
    ),
  );

  const mockBcdsSwitch = vi.fn(
    ({
      children,
      isSelected,
      onChange,
    }: {
      children?: ReactNode;
      isSelected?: boolean;
      onChange?: (selected: boolean) => void;
    }) => (
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={isSelected}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        {children}
      </label>
    ),
  );

  const mockBcdsRadio = vi.fn(
    ({ children, value }: { children?: ReactNode; value?: string }) => (
      <label>
        <input type="radio" value={value} />
        {children}
      </label>
    ),
  );

  const mockBcdsRadioGroup = vi.fn(
    ({
      children,
      label,
      value,
      onChange,
    }: {
      children?: ReactNode;
      label?: string;
      value?: string;
      onChange?: (value: string) => void;
    }) => (
      <fieldset data-testid="bcds-radio-group" data-value={value}>
        <legend>{label}</legend>
        <div onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}>
          {children}
        </div>
      </fieldset>
    ),
  );

  const mockBcdsNumberField = vi.fn(
    ({
      value,
      onChange,
      label,
    }: {
      value?: number;
      onChange?: (value: number) => void;
      label?: string;
    }) => (
      <input
        data-testid="bcds-number-field"
        aria-label={label}
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    ),
  );

  const mockBcdsDatePicker = vi.fn(
    ({
      value,
      onChange,
      label,
    }: {
      value?: { toString: () => string };
      onChange?: (value: { toString: () => string } | null) => void;
      label?: string;
    }) => (
      <input
        data-testid="bcds-date-picker"
        aria-label={label}
        value={value?.toString() ?? ""}
        onChange={(e) =>
          onChange?.(e.target.value ? { toString: () => e.target.value } : null)
        }
      />
    ),
  );

  const mockBcdsSeparator = vi.fn(() => <hr data-testid="bcds-separator" />);

  const mockBcdsProgressBar = vi.fn(
    ({
      value,
      isIndeterminate,
    }: {
      value?: number;
      isIndeterminate?: boolean;
    }) => (
      <div
        data-testid="bcds-progress-bar"
        data-value={value}
        data-indeterminate={String(isIndeterminate ?? false)}
      />
    ),
  );

  const mockBcdsTooltip = vi.fn(({ children }: { children?: ReactNode }) => (
    <span data-testid="bcds-tooltip">{children}</span>
  ));

  const mockBcdsTooltipTrigger = vi.fn(
    ({ children }: { children?: ReactNode }) => (
      <span data-testid="bcds-tooltip-trigger">{children}</span>
    ),
  );

  const mockBcdsTag = vi.fn(({ children }: { children?: ReactNode }) => (
    <span data-testid="bcds-tag">{children}</span>
  ));

  return {
    mockBcdsButton,
    mockBcdsLink,
    mockBcdsText,
    mockBcdsHeading,
    mockBcdsSelect,
    mockBcdsTextField,
    mockBcdsTextArea,
    mockBcdsModal,
    mockBcdsDialog,
    mockBcdsInlineAlert,
    mockBcdsCheckbox,
    mockBcdsSwitch,
    mockBcdsRadio,
    mockBcdsRadioGroup,
    mockBcdsNumberField,
    mockBcdsDatePicker,
    mockBcdsSeparator,
    mockBcdsProgressBar,
    mockBcdsTooltip,
    mockBcdsTooltipTrigger,
    mockBcdsTag,
  };
}

export type BcdsMocks = ReturnType<typeof createBcdsMocksInternal>;

export function createBcdsMocks(): BcdsMocks {
  return createBcdsMocksInternal();
}

export function getBcdsMocks(): BcdsMocks {
  if (globalThis.__bcdsAdapterTestMocks == null) {
    throw new Error("BC DS adapter test mocks are not initialized");
  }
  return globalThis.__bcdsAdapterTestMocks;
}

export function initBcdsMocksForTests(): BcdsMocks {
  globalThis.__bcdsAdapterTestMocks = createBcdsMocksInternal();
  return globalThis.__bcdsAdapterTestMocks;
}

/** Standard vi.mock factory for @bcgov/design-system-react-components. */
export function buildBcdsModuleMock(mocks: BcdsMocks) {
  return {
    Button: (props: Parameters<typeof mocks.mockBcdsButton>[0]) =>
      mocks.mockBcdsButton(props),
    Link: (props: Parameters<typeof mocks.mockBcdsLink>[0]) =>
      mocks.mockBcdsLink(props),
    Text: (props: Parameters<typeof mocks.mockBcdsText>[0]) =>
      mocks.mockBcdsText(props),
    Heading: (props: Parameters<typeof mocks.mockBcdsHeading>[0]) =>
      mocks.mockBcdsHeading(props),
    Select: (props: Parameters<typeof mocks.mockBcdsSelect>[0]) =>
      mocks.mockBcdsSelect(props),
    TextField: (props: Parameters<typeof mocks.mockBcdsTextField>[0]) =>
      mocks.mockBcdsTextField(props),
    TextArea: (props: Parameters<typeof mocks.mockBcdsTextArea>[0]) =>
      mocks.mockBcdsTextArea(props),
    Modal: (props: Parameters<typeof mocks.mockBcdsModal>[0]) =>
      mocks.mockBcdsModal(props),
    Dialog: (props: Parameters<typeof mocks.mockBcdsDialog>[0]) =>
      mocks.mockBcdsDialog(props),
    InlineAlert: (props: Parameters<typeof mocks.mockBcdsInlineAlert>[0]) =>
      mocks.mockBcdsInlineAlert(props),
    Checkbox: (props: Parameters<typeof mocks.mockBcdsCheckbox>[0]) =>
      mocks.mockBcdsCheckbox(props),
    Switch: (props: Parameters<typeof mocks.mockBcdsSwitch>[0]) =>
      mocks.mockBcdsSwitch(props),
    Radio: (props: Parameters<typeof mocks.mockBcdsRadio>[0]) =>
      mocks.mockBcdsRadio(props),
    RadioGroup: (props: Parameters<typeof mocks.mockBcdsRadioGroup>[0]) =>
      mocks.mockBcdsRadioGroup(props),
    NumberField: (props: Parameters<typeof mocks.mockBcdsNumberField>[0]) =>
      mocks.mockBcdsNumberField(props),
    DatePicker: (props: Parameters<typeof mocks.mockBcdsDatePicker>[0]) =>
      mocks.mockBcdsDatePicker(props),
    Separator: () => mocks.mockBcdsSeparator(),
    ProgressBar: (props: Parameters<typeof mocks.mockBcdsProgressBar>[0]) =>
      mocks.mockBcdsProgressBar(props),
    Tooltip: (props: Parameters<typeof mocks.mockBcdsTooltip>[0]) =>
      mocks.mockBcdsTooltip(props),
    TooltipTrigger: (
      props: Parameters<typeof mocks.mockBcdsTooltipTrigger>[0],
    ) => mocks.mockBcdsTooltipTrigger(props),
    Tag: (props: Parameters<typeof mocks.mockBcdsTag>[0]) =>
      mocks.mockBcdsTag(props),
  };
}

export async function mockBcdsDesignSystem() {
  const mocks = initBcdsMocksForTests();
  return buildBcdsModuleMock(mocks);
}
