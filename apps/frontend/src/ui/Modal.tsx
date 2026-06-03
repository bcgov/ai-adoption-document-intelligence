import {
  Dialog as BcdsDialog,
  Modal as BcdsModal,
} from "@bcgov/design-system-react-components";
import type { CSSProperties, ReactNode } from "react";
import { Title } from "./Title";

export interface AppModalProps {
  opened: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  size?: string | number;
  centered?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  withCloseButton?: boolean;
  zIndex?: number;
  styles?: {
    body?: CSSProperties;
    content?: CSSProperties;
    overlay?: CSSProperties;
  };
  /** Mantine prop — BC DS modal always portals */
  withinPortal?: boolean;
  "data-testid"?: string;
}

function modalWidthClass(size: AppModalProps["size"]): string {
  if (size == null) return "bcds-modal--md";
  if (typeof size === "number") return "bcds-modal--custom";
  if (size.includes("vw") || size.includes("%")) return "bcds-modal--fluid";
  switch (size) {
    case "xs":
      return "bcds-modal--xs";
    case "sm":
      return "bcds-modal--sm";
    case "md":
      return "bcds-modal--md";
    case "lg":
      return "bcds-modal--lg";
    case "xl":
      return "bcds-modal--xl";
    case "full":
      return "bcds-modal--full";
    default:
      return "bcds-modal--fluid";
  }
}

function buildModalShellStyle(
  size: AppModalProps["size"],
  contentStyle?: CSSProperties,
): CSSProperties {
  const widthStyle: CSSProperties =
    typeof size === "number"
      ? { width: size }
      : typeof size === "string" &&
          (size.includes("vw") || size.includes("%") || size.includes("px"))
        ? { width: size, maxWidth: "100%" }
        : {};

  return {
    ...widthStyle,
    ...(contentStyle ?? {}),
  };
}

function hasModalTitle(title: ReactNode | undefined): boolean {
  return title != null && title !== false && title !== "";
}

/**
 * BC DS `Modal` + `Dialog` with Mantine controlled `opened` / `onClose` API.
 */
export function Modal({
  opened,
  onClose,
  title,
  children,
  size,
  centered,
  closeOnClickOutside = true,
  closeOnEscape = true,
  withCloseButton = true,
  zIndex,
  styles,
  "data-testid": dataTestId,
}: AppModalProps) {
  if (!opened) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    ...(zIndex != null ? { zIndex } : {}),
    ...(styles?.overlay ?? {}),
  };

  const modalShellStyle = buildModalShellStyle(size, styles?.content);
  const bodyStyle: CSSProperties = styles?.body ?? {};

  const showTitle = hasModalTitle(title);

  const titleNode =
    typeof title === "string" ? (
      <Title order={5} className="bcds-modal-title">
        {title}
      </Title>
    ) : (
      title
    );

  const modalClassName = [
    "bcds-react-aria-Modal",
    "bcds-app-modal",
    modalWidthClass(size),
    centered ? "bcds-modal--centered" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BcdsModal
      isOpen={opened}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable={closeOnClickOutside}
      isKeyboardDismissDisabled={!closeOnEscape}
      className={modalClassName}
      style={{ ...overlayStyle, ...modalShellStyle }}
      data-testid={dataTestId}
    >
      <BcdsDialog
        isCloseable={withCloseButton}
        className="bcds-react-aria-Dialog bcds-modal-dialog"
      >
        {showTitle ? (
          <div className="bcds-modal-header">{titleNode}</div>
        ) : null}
        <div className="bcds-modal-body" style={bodyStyle}>
          {children}
        </div>
      </BcdsDialog>
    </BcdsModal>
  );
}
