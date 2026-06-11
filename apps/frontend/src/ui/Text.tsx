import { Text as BcdsText } from "@bcgov/design-system-react-components";
import {
  type ComponentPropsWithoutRef,
  createElement,
  type ReactNode,
} from "react";
import {
  type AppTextComponent,
  type BcdsTextColor,
  buildBcdsTextClassName,
  buildTypographyStyle,
  type MantineTypographyStyleProps,
  mapMantineColor,
  mapMantineTextSize,
  resolveTextElementType,
  usesNativeTextElement,
} from "./typographyUtils";

type BcdsTextProps = ComponentPropsWithoutRef<typeof BcdsText>;

export interface AppTextProps
  extends Omit<
      BcdsTextProps,
      "size" | "color" | "elementType" | "children" | "className" | "style"
    >,
    MantineTypographyStyleProps {
  children?: ReactNode;
  /** Mantine size: xs/sm → small, md → medium, lg/xl → large */
  size?: BcdsTextProps["size"] | "xs" | "sm" | "md" | "lg" | "xl";
  /** Mantine color shorthand */
  c?: string;
  /** BC DS semantic color (overrides `c` when set) */
  color?: BcdsTextColor;
  /** Mantine polymorphic element */
  component?: AppTextComponent;
  /** Mantine: render as inline span */
  span?: boolean;
  /** Anchor attributes when `component="a"` or `href` is set */
  href?: string;
  target?: string;
  rel?: string;
  className?: string;
  elementType?: BcdsTextProps["elementType"];
}

export function Text({
  children,
  size,
  c,
  color: colorProp,
  component,
  span,
  href,
  target,
  rel,
  className,
  style,
  ta,
  td,
  tt,
  fs,
  ff,
  fw,
  inline,
  lineClamp,
  truncate,
  mt,
  mb,
  ml,
  mr,
  mx,
  py,
  px,
  p,
  pl,
  pr,
  elementType: elementTypeProp,
  ...rest
}: AppTextProps) {
  const bcdsSize = mapMantineTextSize(size);
  const { bcdsColor, inlineColor } = mapMantineColor(c ?? colorProp);
  const mergedStyle = buildTypographyStyle(
    {
      ta,
      td,
      tt,
      fs,
      ff,
      fw,
      inline,
      lineClamp,
      truncate,
      mt,
      mb,
      ml,
      mr,
      mx,
      py,
      px,
      p,
      pl,
      pr,
      style,
    },
    inlineColor,
  );

  const typographyClass = buildBcdsTextClassName(bcdsSize, bcdsColor);
  const mergedClassName = className
    ? `${typographyClass} ${className}`
    : typographyClass;

  if (usesNativeTextElement(component, href)) {
    const tag = component === "ul" ? "ul" : "a";
    return createElement(
      tag,
      {
        ...rest,
        href: tag === "a" ? href : undefined,
        target: tag === "a" ? target : undefined,
        rel: tag === "a" ? rel : undefined,
        className: mergedClassName,
        style: mergedStyle,
      },
      children,
    );
  }

  const elementType =
    elementTypeProp ?? resolveTextElementType(component, span);

  const bcdsProps: BcdsTextProps = {
    ...rest,
    elementType,
    size: bcdsSize,
    color: bcdsColor,
    children,
  };

  if (className !== undefined) {
    bcdsProps.className = className;
  }
  if (mergedStyle !== undefined) {
    bcdsProps.style = mergedStyle;
  }

  return <BcdsText {...bcdsProps} />;
}
