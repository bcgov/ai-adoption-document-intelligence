import { Checkbox, TextInput } from "@mantine/core";
import { FC, KeyboardEvent, useMemo, useState } from "react";
import {
  OVERLAY_BASE_FONT_SIZE as BASE_FONT_SIZE,
  OVERLAY_FONT_FAMILY as FONT_FAMILY,
  measureTextWidth,
} from "../text-measure";
import { getConfidenceBorderColor } from "./ConfidenceIndicator";

interface CanvasFieldOverlayProps {
  fieldKey: string;
  value: string;
  /** OCR confidence — drives the input's border color. */
  confidence?: number;
  isSelectionMark: boolean;
  /** Bounding-box width in screen pixels. The input matches this width. */
  width: number;
  /** Bounding-box height in screen pixels. Used to cap the font size. */
  height: number;
  readOnly?: boolean;
  /** Keyboard-driven hide (e.g. F2 toggle). Combined with mouse-hover fade. */
  hiddenByKeyboard?: boolean;
  onChange: (next: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}

// Font is sized to make the text exactly fill the input width
// (widthFit = 14 × boxW ÷ natural). The heightCap below is the only
// upper bound — no absolute pixel cap, so a wider box always yields
// proportionally larger text that lands flush at the right edge.
const BOX_HEIGHT_MULTIPLIER = 1.5; // cap font at 1.5× the box height

/**
 * Inline edit widget anchored under a field's bounding box in the document
 * view. The input is exactly the bounding box's width. Font size scales up
 * (no letter-spacing tricks) so the natural rendered text matches the box
 * width — first and last characters land near the box's left/right edges.
 *
 * Caps:
 *   - never larger than 1.5× the box height (proportional to surrounding text)
 *   - never larger than 48px absolute
 *   - never smaller than the base 14px (we don't shrink for text wider than
 *     the box; that text stays at 14px and overflows horizontally)
 *
 * Single-line `TextInput` so the rendered text always sits on one line —
 * avoids wrapping breaking the "first/last char on the edges" intent.
 *
 * Hovering fades the overlay to 0 opacity (with 80ms transition) so the
 * reviewer can see the underlying source region.
 */
export const CanvasFieldOverlay: FC<CanvasFieldOverlayProps> = ({
  fieldKey,
  value,
  confidence,
  isSelectionMark,
  width,
  height,
  readOnly,
  hiddenByKeyboard,
  onChange,
  onKeyDown,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const borderColor = getConfidenceBorderColor(confidence);

  const fontSize = useMemo(() => {
    if (isSelectionMark) return BASE_FONT_SIZE;
    if (!value || value.length === 0) return BASE_FONT_SIZE;
    const natural = measureTextWidth(
      value,
      `${BASE_FONT_SIZE}px ${FONT_FAMILY}`,
    );
    if (natural <= 0) return BASE_FONT_SIZE;
    // If natural rendered text is already wider than the box, don't shrink —
    // keep base size and let the input scroll horizontally.
    if (natural >= width) return BASE_FONT_SIZE;
    const widthFit = BASE_FONT_SIZE * (width / natural);
    const heightCap = height * BOX_HEIGHT_MULTIPLIER;
    return Math.max(BASE_FONT_SIZE, Math.min(widthFit, heightCap));
  }, [value, width, height, isSelectionMark]);

  const opacity = isHovering || hiddenByKeyboard ? 0 : 1;

  if (isSelectionMark) {
    return (
      <div
        style={{ width, transition: "opacity 80ms", opacity }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <Checkbox
          autoFocus
          data-overlay-field-key={fieldKey}
          checked={value === ":selected:"}
          onChange={(e) =>
            onChange(e.currentTarget.checked ? ":selected:" : ":unselected:")
          }
          onKeyDown={onKeyDown}
          disabled={readOnly}
          label={value === ":selected:" ? "Selected" : "Unselected"}
          size="sm"
          styles={{
            root: {
              background: "white",
              border: `2px solid ${borderColor}`,
              borderRadius: 4,
              padding: "4px 8px",
              color: "var(--mantine-color-black)",
            },
            label: { color: "var(--mantine-color-black)" },
          }}
        />
        <FieldKeyLabel
          fieldKey={fieldKey}
          confidence={confidence}
          width={width}
        />
      </div>
    );
  }

  return (
    <div
      style={{ width, transition: "opacity 80ms", opacity }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <TextInput
        autoFocus
        data-overlay-field-key={fieldKey}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        disabled={readOnly}
        size="sm"
        styles={{
          input: {
            background: "white",
            color: "var(--mantine-color-black)",
            fontFamily: FONT_FAMILY,
            fontSize: `${fontSize}px`,
            // Bumped from 1.1 so descenders (g, y, p, j) don't get clipped
            // by overflow:hidden at small font sizes.
            lineHeight: 1.35,
            // Confidence-tier border (green/yellow/red/gray).
            border: `2px solid ${borderColor}`,
            // No horizontal padding so the rendered text reaches the edges.
            paddingLeft: 0,
            paddingRight: 0,
            // Tiny vertical breathing room so the line box clears descenders.
            paddingTop: 2,
            paddingBottom: 2,
            // Single-line; text wider than the box scrolls inside the input.
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "clip",
            // Input height tracks font size — keep both in sync so the
            // line-box (font × lineHeight) plus vertical padding always
            // fit within the input.
            height: "auto",
            minHeight: `${Math.ceil(fontSize * 1.35) + 6}px`,
          },
        }}
      />
      <FieldKeyLabel
        fieldKey={fieldKey}
        confidence={confidence}
        width={width}
      />
    </div>
  );
};

interface FieldKeyLabelProps {
  fieldKey: string;
  confidence?: number;
  width: number;
}

/**
 * Field key + confidence shown under the canvas overlay textbox. Sits
 * inside the parent's opacity-faded wrapper so it disappears together
 * with the input on hover (same visibility logic).
 */
const FieldKeyLabel: FC<FieldKeyLabelProps> = ({
  fieldKey,
  confidence,
  width,
}) => {
  const pct =
    typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "—";
  return (
    <div
      style={{
        width,
        marginTop: 2,
        fontFamily: FONT_FAMILY,
        fontSize: 11,
        lineHeight: 1.2,
        color: "var(--mantine-color-black)",
        background: "rgba(255,255,255,0.92)",
        padding: "1px 4px",
        borderRadius: 3,
        display: "flex",
        justifyContent: "flex-start",
        gap: 6,
        pointerEvents: "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      <span style={{ flexShrink: 0 }}>{fieldKey}</span>
      <span style={{ flexShrink: 0, color: "var(--mantine-color-gray-7)" }}>
        {pct}
      </span>
    </div>
  );
};
