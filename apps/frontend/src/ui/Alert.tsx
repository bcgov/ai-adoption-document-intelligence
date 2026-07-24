import { InlineAlert as BcdsInlineAlert } from "@bcgov/design-system-react-components";
import type { CSSProperties, ReactNode } from "react";
import { fieldMarginStyle, mapMantineAlertVariant } from "./formFieldUtils";

export interface AppAlertProps {
  children?: ReactNode;
  title?: ReactNode;
  color?: string;
  variant?: string;
  icon?: ReactNode;
  withCloseButton?: boolean;
  onClose?: () => void;
  mt?: string | number;
  mb?: string | number;
  "data-testid"?: string;
}

/**
 * BC DS `InlineAlert` with Mantine `Alert`-compatible props.
 */
export function Alert({
  children,
  title,
  color,
  variant,
  icon,
  withCloseButton,
  onClose,
  mt,
  mb,
  "data-testid": dataTestId,
}: AppAlertProps) {
  const wrapperStyle: CSSProperties = fieldMarginStyle(mt, mb);
  const titleText = typeof title === "string" ? title : undefined;
  const titleNode = typeof title !== "string" ? title : undefined;
  const descriptionText =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : undefined;

  const srOnlyText = [titleText, descriptionText].filter(Boolean).join(" ");

  return (
    <div data-testid={dataTestId} style={wrapperStyle}>
      {srOnlyText.length > 0 ? (
        <span
          className="bcds-alert-sr-only"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {srOnlyText}
        </span>
      ) : null}
      <BcdsInlineAlert
        variant={mapMantineAlertVariant(color, variant)}
        title={titleText}
        description={descriptionText}
        customIcon={icon}
        isCloseable={withCloseButton ?? Boolean(onClose)}
        onClose={onClose}
      >
        {titleNode}
        {descriptionText == null ? children : null}
      </BcdsInlineAlert>
    </div>
  );
}
