import type { MouseEvent, ReactNode } from "react";

interface FieldListScrollAreaProps {
  children: ReactNode;
  onBackgroundClick?: () => void;
}

/**
 * Scrollable field list for labeling/review workspaces.
 * Uses native overflow so scrolling works reliably inside flex layouts
 * (Mantine ScrollArea often expands to content height without a fixed parent).
 */
export function FieldListScrollArea({
  children,
  onBackgroundClick,
}: FieldListScrollAreaProps) {
  return (
    <div
      className="workspace-field-list-scroll"
      data-testid="field-list-scroll"
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
          onBackgroundClick?.();
        }
      }}
    >
      {children}
    </div>
  );
}
