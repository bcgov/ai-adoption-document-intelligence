import {
  Button as BcdsButton,
  Link as BcdsLink,
} from "@bcgov/design-system-react-components";
import {
  Children,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";

type BcdsButtonProps = ComponentPropsWithoutRef<typeof BcdsButton>;
type BcdsLinkProps = ComponentPropsWithoutRef<typeof BcdsLink>;

/** Mantine-style variants still used across the app. */
type MantineButtonVariant =
  | "filled"
  | "light"
  | "outline"
  | "default"
  | "subtle"
  | "transparent"
  | "white";

type MantineButtonSize =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "compact"
  | "compact-xs"
  | "compact-sm";

export interface AppButtonProps
  extends Omit<
    BcdsButtonProps,
    | "variant"
    | "size"
    | "danger"
    | "isPending"
    | "isDisabled"
    | "children"
    | "onPress"
    | "onClick"
    | "className"
    | "style"
    | "isIconButton"
  > {
  children?: ReactNode;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  variant?: MantineButtonVariant | BcdsButtonProps["variant"];
  size?: MantineButtonSize | BcdsButtonProps["size"];
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  isDisabled?: boolean;
  isPending?: boolean;
  danger?: boolean;
  fullWidth?: boolean;
  className?: string;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
  title?: string;
  /** Mantine polymorphic anchor button (`component="a"`). */
  component?: "a" | "button";
  href?: string;
  /** Mantine spacing shorthands mapped to inline margin. */
  mt?: string;
  mb?: string;
  ml?: string;
  mr?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  onPress?: BcdsButtonProps["onPress"];
}

function isDangerColor(color: string | undefined): boolean {
  return color === "red";
}

/**
 * Maps legacy Mantine variants to BC DS hierarchy:
 * - primary: main action (filled)
 * - secondary: supporting actions with border (outline, default, light)
 * - tertiary: low-profile ghost (subtle, transparent)
 * - link: hyperlink style
 *
 * @see https://www2.gov.bc.ca/gov/content/digital/design-system/components/buttons
 */
export function mapMantineVariantToBcds(
  variant: AppButtonProps["variant"],
): BcdsButtonProps["variant"] {
  switch (variant) {
    case "filled":
    case undefined:
    case "primary":
      return "primary";
    case "outline":
    case "default":
    case "light":
    case "white":
    case "secondary":
      return "secondary";
    case "subtle":
    case "transparent":
    case "tertiary":
      return "tertiary";
    case "link":
      return "link";
    default:
      return "primary";
  }
}

function mapLinkButtonVariant(
  variant: AppButtonProps["variant"],
): NonNullable<BcdsLinkProps["buttonVariant"]> {
  const mapped = mapMantineVariantToBcds(variant);
  if (mapped === "link" || mapped === "tertiary") {
    return "tertiary";
  }
  if (mapped === "secondary") {
    return "secondary";
  }
  return "primary";
}

function mapSize(size: AppButtonProps["size"]): BcdsButtonProps["size"] {
  switch (size) {
    case "xs":
    case "sm":
    case "compact":
    case "compact-sm":
      return "small";
    case "compact-xs":
      return "xsmall";
    case "lg":
    case "xl":
      return "large";
    case "md":
    case undefined:
      return "medium";
    case "xsmall":
    case "small":
    case "medium":
    case "large":
      return size;
    default:
      return "medium";
  }
}

function hasVisibleLabel(children: ReactNode): boolean {
  if (children == null || children === false) {
    return false;
  }
  if (typeof children === "string" || typeof children === "number") {
    return String(children).trim().length > 0;
  }
  const array = Children.toArray(children);
  return array.some((child) => {
    if (typeof child === "string" || typeof child === "number") {
      return String(child).trim().length > 0;
    }
    return child != null;
  });
}

function wrapIcon(node: ReactNode): ReactNode {
  if (node == null || node === false) {
    return null;
  }
  return <span className="bcds-Button-icon">{node}</span>;
}

function wrapLabel(node: ReactNode): ReactNode {
  if (!hasVisibleLabel(node)) {
    return null;
  }
  return <span className="bcds-Button-label">{node}</span>;
}

function buildButtonContent(
  children: ReactNode,
  leftSection?: ReactNode,
  rightSection?: ReactNode,
): ReactNode {
  return (
    <>
      {wrapIcon(leftSection)}
      {wrapLabel(children)}
      {wrapIcon(rightSection)}
    </>
  );
}

function isIconOnlyButton(
  children: ReactNode,
  leftSection?: ReactNode,
  rightSection?: ReactNode,
): boolean {
  return (
    !hasVisibleLabel(children) &&
    Boolean(leftSection) !== Boolean(rightSection) &&
    (leftSection != null || rightSection != null)
  );
}

function mantineSpacing(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const spacing: Record<string, string> = {
    xs: "0.625rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.25rem",
    xl: "2rem",
  };
  return spacing[value] ?? value;
}

function buildMarginStyle({
  mt,
  mb,
  ml,
  mr,
}: Pick<AppButtonProps, "mt" | "mb" | "ml" | "mr">): CSSProperties {
  return {
    marginTop: mantineSpacing(mt),
    marginBottom: mantineSpacing(mb),
    marginLeft: mantineSpacing(ml),
    marginRight: mantineSpacing(mr),
  };
}

function pickPassthroughProps(
  rest: Record<string, unknown>,
): Record<string, unknown> {
  const passthrough: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (
      key.startsWith("data-") ||
      key.startsWith("aria-") ||
      key === "id" ||
      key === "role" ||
      key === "form" ||
      key === "name" ||
      key === "value" ||
      key === "tabIndex"
    ) {
      passthrough[key] = value;
    }
  }
  return passthrough;
}

/**
 * BC DS `Button` with a Mantine-compatible API.
 *
 * **Visual:** Always renders `@bcgov/design-system-react-components` `Button` or
 * `Link` (`isButton`) with BC DS variants, sizes, danger state, and token CSS.
 * Do not style this like Mantine (no theme `color="blue"` fills).
 *
 * **Functional:** Preserves Mantine ergonomics used across the app — `leftSection`,
 * `rightSection`, `loading`, `disabled`, `fullWidth`, `onClick` (incl.
 * `stopPropagation`), `component="a"` + `href`, and legacy `variant` / `size` names
 * mapped to BC DS equivalents.
 *
 * @see docs-md/BC_DESIGN_SYSTEM_MIGRATION.md — “Migration principle: visual vs functional”
 * @see https://www2.gov.bc.ca/gov/content/digital/design-system/components/buttons
 */
export function Button({
  children,
  leftSection,
  rightSection,
  variant,
  size,
  color,
  loading,
  disabled,
  fullWidth,
  className,
  style,
  type = "button",
  title,
  component,
  href,
  mt,
  mb,
  ml,
  mr,
  onClick,
  onPress,
  isDisabled: isDisabledProp,
  isPending: isPendingProp,
  danger: dangerProp,
  ...rest
}: AppButtonProps) {
  const isDisabled = disabled ?? isDisabledProp;
  const isPending = loading ?? isPendingProp;
  const danger = dangerProp ?? isDangerColor(color);
  const bcdsVariant = mapMantineVariantToBcds(variant);
  const bcdsSize = mapSize(size);
  const isIconButton = isIconOnlyButton(children, leftSection, rightSection);
  const passthrough = pickPassthroughProps(rest as Record<string, unknown>);

  const mergedStyle: CSSProperties = {
    ...buildMarginStyle({ mt, mb, ml, mr }),
    ...(fullWidth
      ? { width: "100%", maxWidth: "100%" }
      : {
          width: "fit-content",
          maxWidth: "100%",
          alignSelf: "flex-start",
        }),
    ...style,
  };

  const content = buildButtonContent(children, leftSection, rightSection);

  if (href || component === "a") {
    const ariaLabel =
      typeof passthrough["aria-label"] === "string"
        ? passthrough["aria-label"]
        : undefined;

    const linkIconLeft = leftSection
      ? (wrapIcon(leftSection) as ReactElement)
      : undefined;
    const linkIconRight = rightSection
      ? (wrapIcon(rightSection) as ReactElement)
      : undefined;

    return (
      <BcdsLink
        href={href}
        isButton
        buttonVariant={mapLinkButtonVariant(variant)}
        size={bcdsSize === "xsmall" ? "small" : bcdsSize}
        danger={danger}
        onClick={onClick as BcdsLinkProps["onClick"]}
        ariaLabel={ariaLabel}
        iconLeft={linkIconLeft}
        iconRight={linkIconRight}
        {...passthrough}
        {...(className ? { className } : {})}
        {...(Object.keys(mergedStyle).length > 0 ? { style: mergedStyle } : {})}
        {...(title ? ({ title } as Record<string, string>) : {})}
      >
        {hasVisibleLabel(children) ? children : null}
      </BcdsLink>
    );
  }

  return (
    <BcdsButton
      variant={bcdsVariant}
      size={bcdsSize}
      danger={danger}
      isPending={isPending}
      isDisabled={isDisabled}
      isIconButton={isIconButton}
      type={type}
      onPress={onPress}
      onClick={onClick as BcdsButtonProps["onClick"]}
      {...passthrough}
      {...(className ? { className } : {})}
      {...(Object.keys(mergedStyle).length > 0 ? { style: mergedStyle } : {})}
      {...(title ? ({ title } as Record<string, string>) : {})}
    >
      {content}
    </BcdsButton>
  );
}
