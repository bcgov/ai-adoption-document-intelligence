import {
  Tooltip as BcdsTooltip,
  TooltipTrigger,
} from "@bcgov/design-system-react-components";
import {
  Children,
  type CSSProperties,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

type TooltipPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-start"
  | "top-end"
  | "bottom-start"
  | "bottom-end";

function mapMantineTooltipPosition(
  position: TooltipPlacement | undefined,
): "top" | "bottom" | "left" | "right" {
  if (position == null) {
    return "top";
  }
  if (position.startsWith("bottom")) {
    return "bottom";
  }
  if (position.startsWith("left")) {
    return "left";
  }
  if (position.startsWith("right")) {
    return "right";
  }
  return "top";
}

export interface AppTooltipProps {
  label: ReactNode;
  children: ReactElement;
  position?: TooltipPlacement;
  disabled?: boolean;
  /** Mantine prop — BC DS tooltips always include an arrow */
  withArrow?: boolean;
  multiline?: boolean;
  w?: number | string;
}

function withInlineFlexTriggerStyle(child: ReactElement): ReactElement {
  const props = child.props as { style?: CSSProperties };
  const existing =
    typeof props.style === "object" && props.style != null ? props.style : {};
  if (existing.display != null) {
    return child;
  }
  return cloneElement(child, {
    style: {
      display: "inline-flex",
      ...existing,
    },
  } as Record<string, unknown>);
}

function ensureFocusableTrigger(child: ReactElement): ReactElement {
  const props = child.props as {
    tabIndex?: number;
    role?: string;
    style?: CSSProperties;
  };
  if (props.tabIndex != null || props.role === "button") {
    return withInlineFlexTriggerStyle(child);
  }
  return cloneElement(child, {
    tabIndex: 0,
    style: {
      display: "inline-flex",
      ...(typeof props.style === "object" ? props.style : {}),
    },
  } as Record<string, unknown>);
}

/**
 * BC DS `Tooltip` + `TooltipTrigger` with Mantine-compatible `label` / `position`.
 */
export function Tooltip({
  label,
  children,
  position = "top",
  disabled,
  multiline,
  w,
}: AppTooltipProps) {
  if (disabled) {
    return children;
  }

  const onlyChild = Children.only(children);
  if (!isValidElement(onlyChild)) {
    return children;
  }

  const contentStyle: CSSProperties = {};
  if (w != null) {
    contentStyle.maxWidth = typeof w === "number" ? `${w}px` : w;
  }
  if (multiline) {
    contentStyle.whiteSpace = "pre-wrap";
  }

  const trigger =
    onlyChild.type === "span"
      ? withInlineFlexTriggerStyle(onlyChild)
      : ensureFocusableTrigger(onlyChild);
  const titleAttr = typeof label === "string" ? label : undefined;
  const triggerNode =
    titleAttr != null ? (
      <span title={titleAttr} style={{ display: "inline-flex" }}>
        {trigger}
      </span>
    ) : (
      trigger
    );

  return (
    <TooltipTrigger>
      {triggerNode}
      <BcdsTooltip placement={mapMantineTooltipPosition(position)}>
        <span
          style={
            Object.keys(contentStyle).length > 0 ? contentStyle : undefined
          }
        >
          {label}
        </span>
      </BcdsTooltip>
    </TooltipTrigger>
  );
}
