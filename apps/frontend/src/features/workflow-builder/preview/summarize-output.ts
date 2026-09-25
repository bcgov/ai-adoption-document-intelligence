/**
 * `summarizeValueLine` — collapse any previewable output value into ONE short
 * line for the node card's fixed-height result strip (UX walkthrough
 * 2026-08-06, item 9, Option C).
 *
 * Why this exists: the strip is one line tall and can never grow, because a
 * card that changes height when a run lands is exactly the reflow item 9 is
 * about. So the strip cannot render the kind-specific widgets — it needs a
 * lossy, bounded, single-line rendering, and the full value moves into the
 * popover behind it.
 *
 * **Deliberately kind-agnostic.** It reads the shape of the JSON, never a
 * field name, so no document-, OCR- or classification-specific key is
 * privileged. Adding a new output kind needs no change here; the kind's own
 * widget still renders the real thing inside the popover.
 *
 * The bound is characters, not pixels: `SUMMARY_MAX_CHARS` is calibrated to
 * the narrowest card (the source card, 320px) at the strip's font size, and
 * CSS truncates whatever still overflows. Truncating in the string as well
 * keeps the DOM small when a value is a megabyte of text.
 */

import type { BlobExcerpt } from "./preview.types";

/** Hard character bound for a summary line. Longer values get an ellipsis. */
export const SUMMARY_MAX_CHARS = 72;

/** Shown when the value slot exists but holds nothing readable. */
export const NO_VALUE_SUMMARY = "no value";

/** Collapse newlines/tabs/runs of spaces so the line cannot wrap. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  return text.length > SUMMARY_MAX_CHARS
    ? `${text.slice(0, SUMMARY_MAX_CHARS - 1)}…`
    : text;
}

/**
 * The first *readable* line of a string: leading blank lines are skipped, so
 * an OCR block or a markdown document that opens with whitespace still shows
 * its first real words rather than an empty strip.
 */
function firstMeaningfulLine(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return oneLine(trimmed);
  }
  return "";
}

/**
 * The blob pointer's path, when `value` is one. Same predicate
 * `render-kind-value.tsx` uses — kept structural (a `blobPath` string) rather
 * than kind-driven so it holds for every kind that stores its payload out of
 * ctx, present and future.
 */
function blobPathOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const path = (value as { blobPath?: unknown }).blobPath;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

/**
 * One level of nesting only. A summary of a summary is noise, so nested
 * objects and arrays collapse to their shape (`{3 fields}`, `[5]`) rather
 * than recursing into their contents.
 */
function inner(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return firstMeaningfulLine(value) || '""';
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") {
    const count = Object.keys(value as Record<string, unknown>).length;
    return count === 1 ? "{1 field}" : `{${count} fields}`;
  }
  return "—";
}

/**
 * One line describing `value`, bounded by `SUMMARY_MAX_CHARS`.
 *
 * - `undefined` — the ctx key holds nothing (the engine never writes
 *   `undefined` into a run context, so this is a sound "absent" signal).
 * - a string — its first non-blank line, whitespace collapsed. Alex's ruling
 *   on item 9's follow-up: show the value's first line, not just kind +
 *   status, accepting that it reads ragged across kinds.
 * - a list — its length, then a summary of its first element, so `12 items ·
 *   {4 fields}` tells you both how much came back and what one looks like.
 * - an object — its top-level fields as `key: value` pairs until the bound is
 *   reached, which is the closest thing to a "first line" an object has.
 */
export function summarizeValueLine(
  value: unknown,
  excerpts?: Record<string, BlobExcerpt>,
): string {
  if (value === undefined) return NO_VALUE_SUMMARY;
  if (value === null) return "null";

  // G-022 — an `OcrResult` (and anything else large) travels through ctx as a
  // POINTER, so summarising it verbatim would print `blobPath: …/ocr.json`,
  // which tells the author nothing about what the step produced. The server
  // already dereferenced it into `blobExcerpts`; follow that, exactly as the
  // full widgets do, and fall back to the pointer only when it could not be
  // resolved.
  const path = blobPathOf(value);
  if (path !== undefined) {
    const excerpt = excerpts?.[path];
    if (excerpt?.status === "resolved") {
      // Carry the map through the recursion. The server dereferences one level
      // today so a pointer inside an excerpt cannot occur, but dropping the map
      // here would make that a silent `blobPath: …` the day it can.
      return summarizeValueLine(excerpt.excerpt, excerpts);
    }
    if (excerpt?.status === "unavailable") {
      return `stored value unavailable (${excerpt.reason ?? "unknown"})`;
    }
    return "stored value";
  }

  if (typeof value === "string") {
    const line = firstMeaningfulLine(value);
    return line === "" ? NO_VALUE_SUMMARY : truncate(line);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "empty list";
    const noun = value.length === 1 ? "item" : "items";
    return truncate(`${value.length} ${noun} · ${inner(value[0])}`);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "no fields";
    const parts: string[] = [];
    let width = 0;
    for (const [key, entryValue] of entries) {
      // Bound each PAIR, so the FIRST one always gets in. Without this, an
      // object whose first field is long — `{ text: "<a page of OCR>" }`, the
      // commonest single-field output there is — overflowed on entry one, the
      // loop pushed "…" immediately, and the whole strip read as a lone
      // ellipsis naming neither the field nor a word of its value.
      const part = truncate(`${key}: ${inner(entryValue)}`);
      // Stop at the bound rather than building the whole object and slicing:
      // a preview row can hold a large payload and this runs per node, per
      // render, on the canvas.
      if (width > 0 && width + part.length + 2 > SUMMARY_MAX_CHARS) {
        parts.push("…");
        break;
      }
      parts.push(part);
      width += part.length + 2;
    }
    return truncate(parts.join(", "));
  }

  return NO_VALUE_SUMMARY;
}
