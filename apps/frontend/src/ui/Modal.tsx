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
    header?: CSSProperties;
    title?: CSSProperties;
  };
  /** Remove default body padding (full-bleed content such as document viewer). */
  fullBleedBody?: boolean;
  /** Darker overlay backdrop (e.g. document viewer). */
  darkOverlay?: boolean;
  /** Mantine prop — BC DS modal always portals */
  withinPortal?: boolean;
  /** Accessible name when no visible title is provided */
  "aria-label"?: string;
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

  const {
    height: _height,
    maxHeight: _maxHeight,
    ...contentWithoutHeight
  } = contentStyle ?? {};

  return {
    ...widthStyle,
    ...contentWithoutHeight,
  };
}

function isTallModal(contentStyle?: CSSProperties): boolean {
  if (!contentStyle) return false;
  const height = contentStyle.height ?? contentStyle.maxHeight;
  return (
    height === "90vh" ||
    height === "100vh" ||
    (typeof height === "string" && height.includes("vh"))
  );
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
  centered: _centered,
  closeOnClickOutside = true,
  closeOnEscape = true,
  withCloseButton = true,
  zIndex,
  styles,
  fullBleedBody = false,
  darkOverlay = false,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: AppModalProps) {
  if (!opened) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    ...(zIndex != null ? { zIndex } : {}),
    ...(styles?.overlay ?? {}),
  };

  const tallModal = isTallModal(styles?.content);
  const modalShellStyle = buildModalShellStyle(size, styles?.content);
  const bodyStyle: CSSProperties = styles?.body ?? {};
  const headerStyle: CSSProperties = styles?.header ?? {};
  const titleStyle: CSSProperties = styles?.title ?? {};

  const showTitle = hasModalTitle(title);

  const titleNode =
    typeof title === "string" ? (
      <Title
        order={5}
        className="bcds-modal-title"
        slot="title"
        style={titleStyle}
      >
        {title}
      </Title>
    ) : (
      <div className="bcds-modal-title-custom" style={titleStyle}>
        {title}
      </div>
    );

  const modalClassName = [
    "bcds-react-aria-Modal",
    "bcds-app-modal",
    modalWidthClass(size),
    tallModal ? "bcds-modal--tall" : null,
    zIndex != null && zIndex >= 1000 ? "bcds-modal--elevated" : null,
    darkOverlay ? "bcds-modal--dark-overlay" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const bodyClassName = [
    "bcds-modal-body",
    fullBleedBody ? "bcds-modal-body--flush" : null,
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
        aria-label={showTitle ? undefined : ariaLabel}
      >
        {showTitle ? (
          <div className="bcds-modal-header" style={headerStyle}>
            {titleNode}
          </div>
        ) : null}
        <div className={bodyClassName} style={bodyStyle}>
          {children}
        </div>
      </BcdsDialog>
    </BcdsModal>
  );
}
