import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { type AppButtonProps, Button } from "./Button";
import { Tooltip } from "./Tooltip";

export interface IconActionButtonProps {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: AppButtonProps["variant"];
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  tooltip: string;
  icon: ReactNode;
  style?: CSSProperties;
}

/**
 * Icon-only action with tooltip. BC DS `Button` (`isIconButton`) + `Tooltip`.
 * Supports native `onClick` with `stopPropagation` for table row contexts.
 */
export function IconActionButton({
  tooltip,
  icon,
  variant = "subtle",
  color,
  disabled,
  loading,
  onClick,
  style,
}: IconActionButtonProps) {
  return (
    <Tooltip label={tooltip}>
      <span style={{ display: "inline-flex" }}>
        <Button
          variant={variant}
          color={color}
          disabled={disabled}
          loading={loading}
          onClick={onClick}
          aria-label={tooltip}
          style={style}
        >
          {icon}
        </Button>
      </span>
    </Tooltip>
  );
}
