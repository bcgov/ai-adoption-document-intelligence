import { Heading as BcdsHeading } from "@bcgov/design-system-react-components";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  type BcdsHeadingColor,
  buildTypographyStyle,
  type MantineTypographyStyleProps,
  mapMantineColor,
  mapMantineTitleOrder,
} from "./typographyUtils";

type BcdsHeadingProps = ComponentPropsWithoutRef<typeof BcdsHeading>;

export interface AppTitleProps
  extends Omit<
      BcdsHeadingProps,
      "color" | "children" | "className" | "style" | "level"
    >,
    MantineTypographyStyleProps {
  children?: ReactNode;
  /** Mantine heading level (1–6) */
  order?: number;
  /** BC DS heading level (overrides `order` when set) */
  level?: BcdsHeadingProps["level"];
  /** Mantine color shorthand */
  c?: string;
  className?: string;
  color?: BcdsHeadingColor;
}

export function Title({
  children,
  order,
  c,
  color: colorProp,
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
  mt,
  mb,
  ml,
  mr,
  py,
  px,
  level: levelProp,
  ...rest
}: AppTitleProps) {
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
      mt,
      mb,
      ml,
      mr,
      py,
      px,
      style,
    },
    inlineColor,
  );

  const level = levelProp ?? mapMantineTitleOrder(order);

  const bcdsProps: BcdsHeadingProps = {
    ...rest,
    level,
    color: bcdsColor,
    children,
  };

  if (className !== undefined) {
    bcdsProps.className = className;
  }
  if (mergedStyle !== undefined) {
    bcdsProps.style = mergedStyle;
  }

  return <BcdsHeading {...bcdsProps} />;
}
