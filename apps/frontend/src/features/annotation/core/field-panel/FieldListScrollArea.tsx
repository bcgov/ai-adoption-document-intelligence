import type { MouseEvent, ReactNode } from "react";

interface FieldListScrollAreaProps {
  children: ReactNode;
  onBackgroundClick?: () => void;
}

/**
 * Scrollable field list for labeling/review workspaces.
 *
 * The scroll box is taken out of flow (`position: absolute; inset: 0`) inside a
 * flex-sized relative viewport — the same pattern the document canvas uses. A
 * scroll container sized purely by `flex: 1 1 0` can paint clipped yet still
 * leak its content height into the document's scrollable area (producing a
 * phantom page scrollbar); pinning it absolutely guarantees the tall field list
 * only ever scrolls inside its own box and never extends any ancestor.
 */
export function FieldListScrollArea({
  children,
  onBackgroundClick,
}: FieldListScrollAreaProps) {
  return (
    <div className="workspace-field-list-viewport">
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
    </div>
  );
}
