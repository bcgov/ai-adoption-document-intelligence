/**
 * The node result strip's geometry, in its own module because two very
 * different places need it and neither should pull in the other:
 *
 *   - `NodeResultStrip.tsx` renders to these numbers (React + Mantine);
 *   - `canvas/port-rows.ts` adds them to `estimateNodeHeight` so dagre lays
 *     the graph out around the same band (a pure selector, no React).
 *
 * They are the whole mechanism behind item 9. The card reserves this space at
 * rest, so a run changes what the strip SAYS and never how tall the card is.
 * If the strip's rendered height and `estimateNodeHeight` ever disagree, the
 * reflow comes back — quietly, and only after a Try.
 */

/**
 * Height of the strip's content row (px). A constant every state renders
 * into — never a min-height, never content-driven.
 */
export const PREVIEW_STRIP_HEIGHT_PX = 24;

/** Gap between the card's body and the strip. */
export const PREVIEW_STRIP_MARGIN_TOP_PX = 6;

/** What the strip adds to a card's rendered height. */
export const PREVIEW_STRIP_TOTAL_HEIGHT_PX =
  PREVIEW_STRIP_HEIGHT_PX + PREVIEW_STRIP_MARGIN_TOP_PX;
