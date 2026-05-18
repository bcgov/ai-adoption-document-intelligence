/**
 * Activity: Recover numeric values from misread checkboxes
 *
 * Azure Document Intelligence sometimes parses a handwritten or printed "0" as
 * a selection mark (open circle ≈ unselected checkbox). For custom-model fields
 * declared as `number`, this manifests as an empty value (`null` for template
 * models, `valueString: ""` for neural models) instead of the intended `0`.
 *
 * This activity recovers those zeros (or any configured numeric value) using
 * the OCR layout: tables, table cells, page-level selection marks, and page
 * paragraphs. The mapping from a table cell to a custom-model field is fully
 * configurable via activity parameters (no schema or DB changes required).
 * The activity is generic and works for any form with currency/numeric table
 * cells whose positions are encoded by the prebuilt-layout step.
 *
 * Three table-finder strategies, tried in order per configured table:
 *
 *   1. Title anchor (the original strategy):
 *      find the OCR table whose first cell (r0c0) text equals/contains
 *      the configured `find.firstCellTextEquals|firstCellTextContains`.
 *
 *   2. Row-label anchor (fallbackTableFinder.labelAnchor):
 *      scan candidate tables by shape (rowCount and columnCount within
 *      configured ranges) for one where >= minLabelMatches of the
 *      configured row-label texts appear in column 0
 *      (case-insensitive contains). First match wins; column mapping
 *      reuses the header-text matcher.
 *
 *   3. Positional anchor (fallbackTableFinder.positionalAnchor):
 *      for each candidate by shape, locate every expected row label as
 *      a loose-substring match on the page paragraphs. Pair each match
 *      with the candidate table's row whose midY is closest. Tally
 *      `offset = label_index - row_index` votes; require
 *        top_votes >= minVotes AND top_votes >= dominanceRatio * second_votes
 *      to commit. Apply the dominant offset uniformly to map all rows.
 *      Column mapping sorts the candidate's columns by midX and assigns
 *      left-to-right to the config's prefixes; if there is one extra
 *      column, drop the column whose cells are predominantly
 *      "pure currency prefix" (mostly just `$`/`€`/`£`/`¥`).
 *
 * Per-cell eligibility (identical across all three strategies):
 *   - The cell content has no digits and no letters after stripping
 *     configured tokens (default: `$`, `€`, `£`, `¥`, `:selected:`,
 *     `:unselected:`).
 *   - At least one `pages[].selectionMarks[*]` polygon overlaps the cell's
 *     bounding region (when `requireSelectionMarkInCell`, default true).
 *   - The mapped `documents[0].fields[fieldKey]` must currently be empty.
 *
 * A flipped field is stamped with `valueNumber`, `content`, `valueString`.
 * The EnrichmentChange reason includes which strategy hit so downstream
 * auditing can split by source.
 */

import {
  type CorrectionResult,
  type CorrectionToolParams,
  deepCopyOcrResult,
} from "../correction-types";
import { createActivityLogger } from "../logger";
import type {
  AzureDocumentFieldValue,
  EnrichmentChange,
  OCRResult,
  Page,
  Paragraph,
  SelectionMark,
  Table,
  TableCell,
} from "../types";

export interface RecoveryColumnConfig {
  /** Prefix applied to the row's `suffix` to build the field key (e.g. `applicant_`). */
  prefix: string;
  /** Match against a column-header cell's content. */
  headerEquals?: string;
  headerContains?: string;
}

export interface RecoveryRowConfig {
  /** Suffix appended to a column's `prefix` to build the field key (e.g. `net_employment_income`). */
  suffix: string;
  /** Match against a col-0 (row-label) cell's content. */
  labelEquals?: string;
  labelContains?: string;
}

export interface RecoveryCellEligibility {
  /** Tokens stripped from cell content before the digit/letter test. */
  stripBeforeCheck?: string[];
  /** Require at least one selection mark polygon to overlap the cell bbox. */
  requireSelectionMarkInCell?: boolean;
  /**
   * Specific selection-mark states that qualify. Empty/undefined accepts any.
   * Most callers leave this empty: Azure's layout sometimes flips selected/
   * unselected on circular glyphs, so insisting on `unselected` causes misses.
   */
  acceptedMarkStates?: Array<"selected" | "unselected">;
}

export interface RecoveryShapeFilter {
  minRowCount?: number;
  maxRowCount?: number;
  minColumnCount?: number;
  maxColumnCount?: number;
}

export interface RecoveryLabelAnchorConfig {
  /** Minimum number of expected row labels that must appear in column 0 of a candidate. */
  minLabelMatches?: number;
}

export interface RecoveryPositionalAnchorConfig {
  /** Minimum number of votes the dominant offset needs to be applied. */
  minVotes?: number;
  /** Top offset must beat the runner-up by this ratio (default 2.0). */
  dominanceRatio?: number;
}

export interface RecoveryFallbackTableFinder {
  /** Shape constraints used by both label-anchor and positional-anchor strategies. */
  shape?: RecoveryShapeFilter;
  /** Group A (label-anchor) settings. Omit to disable. */
  labelAnchor?: RecoveryLabelAnchorConfig;
  /** Group B (positional-anchor) settings. Omit to disable. */
  positionalAnchor?: RecoveryPositionalAnchorConfig;
}

export interface RecoveryTableConfig {
  /** Identifies the target table among `ocrResult.tables`. */
  find: { firstCellTextContains?: string; firstCellTextEquals?: string };
  /** Column → field-key prefix mapping. */
  columns: RecoveryColumnConfig[];
  /** Row → field-key suffix mapping. */
  rows: RecoveryRowConfig[];
  /** Value written into the field when a cell is eligible. Defaults to 0. */
  recoveryValue?: number;
  /** What counts as an eligible cell. Defaults match SDPR-style currency cells. */
  cellEligibility?: RecoveryCellEligibility;
  /**
   * Optional fallback table-finder strategies, applied when the title finder
   * misses. Without this block the activity behaves exactly as the original
   * (title-only) implementation.
   */
  fallbackTableFinder?: RecoveryFallbackTableFinder;
}

export interface RecoverNumericZerosFromCheckboxesParams
  extends CorrectionToolParams {
  /** Per-table recovery rules. Activity is a no-op when empty/omitted. */
  tables?: RecoveryTableConfig[];
}

type RecoveryStrategy = "title-anchor" | "label-anchor" | "positional-anchor";

const DEFAULT_STRIP_TOKENS = ["$", "€", "£", "¥", ":selected:", ":unselected:"];
const CURRENCY_TOKENS = ["$", "€", "£", "¥"];

const DEFAULT_SHAPE_FILTER: Required<RecoveryShapeFilter> = {
  minRowCount: 18,
  maxRowCount: 21,
  minColumnCount: 2,
  maxColumnCount: 3,
};
const DEFAULT_MIN_LABEL_MATCHES = 12;
const DEFAULT_MIN_VOTES = 3;
const DEFAULT_DOMINANCE_RATIO = 2.0;

// ---------------------------------------------------------------------------
// Text + geometry helpers
// ---------------------------------------------------------------------------

function normalizeText(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLoose(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function matchesEquals(actual: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return (
    normalizeText(actual).toLowerCase() ===
    normalizeText(expected).toLowerCase()
  );
}

function matchesContains(
  actual: string,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  return normalizeText(actual)
    .toLowerCase()
    .includes(normalizeText(expected).toLowerCase());
}

function looseContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return normalizeLoose(haystack).includes(normalizeLoose(needle));
}

/** Axis-aligned bounding box of a polygon expressed as [x1,y1,x2,y2,...]. */
function polygonBBox(
  polygon: number[] | undefined,
): [number, number, number, number] | null {
  if (!polygon || polygon.length < 4) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < polygon.length; i += 2) {
    const x = polygon[i];
    const y = polygon[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function bboxOverlaps(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

function cellHasSelectionMark(
  cell: TableCell,
  pages: Page[],
  acceptedStates?: Array<"selected" | "unselected">,
): boolean {
  const region = cell.boundingRegions?.[0];
  if (!region) return false;
  const cellBox = polygonBBox(region.polygon);
  if (!cellBox) return false;
  const page = pages.find((p) => p.pageNumber === region.pageNumber);
  const marks: SelectionMark[] = page?.selectionMarks ?? [];
  for (const m of marks) {
    if (
      acceptedStates &&
      acceptedStates.length > 0 &&
      !acceptedStates.includes(m.state)
    ) {
      continue;
    }
    const markBox = polygonBBox(m.polygon);
    if (!markBox) continue;
    if (bboxOverlaps(cellBox, markBox)) return true;
  }
  return false;
}

function cellIsEligibleByContent(
  content: string,
  stripTokens: string[],
): boolean {
  let stripped = content;
  for (const token of stripTokens) {
    if (!token) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    stripped = stripped.replace(new RegExp(escaped, "gi"), "");
  }
  stripped = stripped.replace(/\s+/g, "");
  if (stripped.length === 0) return true;
  return !/[A-Za-z0-9]/.test(stripped);
}

function fieldIsEmpty(field: AzureDocumentFieldValue | undefined): boolean {
  if (!field) return true;
  if (typeof field.valueNumber === "number") return false;
  if (typeof field.valueInteger === "number") return false;
  const vs = field.valueString;
  if (typeof vs === "string" && vs.trim().length > 0) return false;
  const c = field.content;
  if (typeof c === "string" && c.trim().length > 0) return false;
  return true;
}

function getCell(
  table: Table,
  rowIndex: number,
  columnIndex: number,
): TableCell | undefined {
  return table.cells.find(
    (c) => c.rowIndex === rowIndex && c.columnIndex === columnIndex,
  );
}

// ---------------------------------------------------------------------------
// Table geometry helpers
// ---------------------------------------------------------------------------

function tablePageNumber(table: Table): number | undefined {
  for (const c of table.cells) {
    const region = c.boundingRegions?.[0];
    if (region && typeof region.pageNumber === "number")
      return region.pageNumber;
  }
  return undefined;
}

/** Return Map<row_index, midY> computed from cells in the given column
 * (falls back to any column when the anchor column lacks bboxes). */
function tableRowMidYs(table: Table, anchorColumn = 0): Map<number, number> {
  const rc = table.rowCount ?? 0;
  const out = new Map<number, number>();
  for (let r = 0; r < rc; r++) {
    const candidates =
      table.cells.filter(
        (c) => c.rowIndex === r && c.columnIndex === anchorColumn,
      ).length > 0
        ? table.cells.filter(
            (c) => c.rowIndex === r && c.columnIndex === anchorColumn,
          )
        : table.cells.filter((c) => c.rowIndex === r);
    for (const c of candidates) {
      const region = c.boundingRegions?.[0];
      const bx = polygonBBox(region?.polygon);
      if (bx) {
        out.set(r, (bx[1] + bx[3]) / 2);
        break;
      }
    }
  }
  return out;
}

/** Return Map<col_index, midX> averaged across cells with bboxes. */
function tableColMidXs(table: Table): Map<number, number> {
  const cc = table.columnCount ?? 0;
  const sums = new Map<number, number[]>();
  for (let ci = 0; ci < cc; ci++) sums.set(ci, []);
  for (const c of table.cells) {
    const ci = c.columnIndex;
    if (typeof ci !== "number" || ci < 0 || ci >= cc) continue;
    const region = c.boundingRegions?.[0];
    const bx = polygonBBox(region?.polygon);
    if (bx) {
      const arr = sums.get(ci);
      if (arr) arr.push((bx[0] + bx[2]) / 2);
    }
  }
  const out = new Map<number, number>();
  for (const [ci, arr] of sums) {
    if (arr.length > 0) {
      out.set(ci, arr.reduce((a, b) => a + b, 0) / arr.length);
    }
  }
  return out;
}

function columnIsPureCurrencyPrefix(table: Table, colIdx: number): boolean {
  const colCells = table.cells.filter((c) => c.columnIndex === colIdx);
  if (colCells.length === 0) return false;
  let pure = 0;
  for (const c of colCells) {
    let stripped = c.content ?? "";
    for (const tok of CURRENCY_TOKENS) {
      stripped = stripped.split(tok).join("");
    }
    stripped = stripped.replace(/\s+/g, "");
    if (stripped.length === 0) pure++;
  }
  return pure >= 0.7 * colCells.length;
}

// ---------------------------------------------------------------------------
// Strategy 1 — Title anchor
// ---------------------------------------------------------------------------

function findTableByTitle(
  tables: Table[],
  find: RecoveryTableConfig["find"],
): { table: Table; index: number } | null {
  for (let i = 0; i < tables.length; i++) {
    const firstCell = tables[i].cells.find(
      (c) => c.rowIndex === 0 && c.columnIndex === 0,
    );
    const content = firstCell?.content ?? "";
    if (
      find.firstCellTextEquals &&
      matchesEquals(content, find.firstCellTextEquals)
    ) {
      return { table: tables[i], index: i };
    }
    if (
      find.firstCellTextContains &&
      matchesContains(content, find.firstCellTextContains)
    ) {
      return { table: tables[i], index: i };
    }
  }
  return null;
}

function resolveColumnIndexesByHeader(
  table: Table,
  columns: RecoveryColumnConfig[],
): Map<string, number> {
  const map = new Map<string, number>();
  const headerCells = table.cells.filter(
    (c) =>
      c.kind === "columnHeader" ||
      ((c.rowIndex === 0 || c.rowIndex === 1) &&
        normalizeText(c.content).length > 0),
  );
  for (const col of columns) {
    const hit = headerCells.find(
      (c) =>
        matchesEquals(c.content, col.headerEquals) ||
        matchesContains(c.content, col.headerContains),
    );
    if (hit) map.set(col.prefix, hit.columnIndex);
  }
  return map;
}

function resolveRowIndexesByLabel(
  table: Table,
  rows: RecoveryRowConfig[],
): Map<string, number> {
  const map = new Map<string, number>();
  const labelCells = table.cells.filter((c) => c.columnIndex === 0);
  for (const row of rows) {
    const hit = labelCells.find(
      (c) =>
        matchesEquals(c.content, row.labelEquals) ||
        matchesContains(c.content, row.labelContains),
    );
    if (hit) map.set(row.suffix, hit.rowIndex);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Shape filter shared by Group A + Group B
// ---------------------------------------------------------------------------

function candidateTablesByShape(
  tables: Table[],
  shape: RecoveryShapeFilter | undefined,
): Array<{ table: Table; index: number }> {
  const minRC = shape?.minRowCount ?? DEFAULT_SHAPE_FILTER.minRowCount;
  const maxRC = shape?.maxRowCount ?? DEFAULT_SHAPE_FILTER.maxRowCount;
  const minCC = shape?.minColumnCount ?? DEFAULT_SHAPE_FILTER.minColumnCount;
  const maxCC = shape?.maxColumnCount ?? DEFAULT_SHAPE_FILTER.maxColumnCount;
  const out: Array<{ table: Table; index: number }> = [];
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    if (typeof t.rowCount !== "number" || typeof t.columnCount !== "number")
      continue;
    if (
      t.rowCount >= minRC &&
      t.rowCount <= maxRC &&
      t.columnCount >= minCC &&
      t.columnCount <= maxCC
    ) {
      out.push({ table: t, index: i });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strategy 2 — Row-label anchor (Group A)
// ---------------------------------------------------------------------------

interface LocateResult {
  table: Table;
  index: number;
  columnMap: Map<string, number>;
  rowMap: Map<string, number>;
  strategy: RecoveryStrategy;
}

function findTableByRowLabels(
  tables: Table[],
  cfg: RecoveryTableConfig,
): LocateResult | null {
  const fb = cfg.fallbackTableFinder;
  const la = fb?.labelAnchor;
  if (!la) return null; // Group A disabled
  const minMatches = la.minLabelMatches ?? DEFAULT_MIN_LABEL_MATCHES;
  const candidates = candidateTablesByShape(tables, fb?.shape);
  for (const cand of candidates) {
    const rowMap = resolveRowIndexesByLabel(cand.table, cfg.rows);
    if (rowMap.size >= minMatches) {
      const columnMap = resolveColumnIndexesByHeader(cand.table, cfg.columns);
      return {
        table: cand.table,
        index: cand.index,
        columnMap,
        rowMap,
        strategy: "label-anchor",
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strategy 3 — Positional anchor via offset vote (Group B)
// ---------------------------------------------------------------------------

interface LabelAnchorHit {
  labelIndex: number;
  suffix: string;
  midY: number;
}

function findLabelParagraphAnchors(
  paragraphs: Paragraph[],
  pageNo: number | undefined,
  rowsCfg: RecoveryRowConfig[],
): LabelAnchorHit[] {
  const samePage: Array<{ text: string; midY: number }> = [];
  for (const p of paragraphs) {
    const region = p.boundingRegions?.[0];
    if (!region) continue;
    if (pageNo !== undefined && region.pageNumber !== pageNo) continue;
    const bx = polygonBBox(region.polygon);
    if (!bx) continue;
    samePage.push({ text: p.content ?? "", midY: (bx[1] + bx[3]) / 2 });
  }
  const out: LabelAnchorHit[] = [];
  for (let labelIndex = 0; labelIndex < rowsCfg.length; labelIndex++) {
    const row = rowsCfg[labelIndex];
    const needle = row.labelEquals ?? row.labelContains ?? "";
    if (!needle) continue;
    for (const para of samePage) {
      if (looseContains(para.text, needle)) {
        out.push({ labelIndex, suffix: row.suffix, midY: para.midY });
        break; // first match per label
      }
    }
  }
  return out;
}

function buildPositionalColumnMap(
  table: Table,
  columnsCfg: RecoveryColumnConfig[],
): Map<string, number> | null {
  const midXs = tableColMidXs(table);
  const cc = table.columnCount ?? 0;
  if (midXs.size < columnsCfg.length) return null;

  if (cc === columnsCfg.length) {
    const sorted = Array.from(midXs.entries()).sort((a, b) => a[1] - b[1]);
    const map = new Map<string, number>();
    for (let i = 0; i < columnsCfg.length; i++) {
      map.set(columnsCfg[i].prefix, sorted[i][0]);
    }
    return map;
  }

  if (cc > columnsCfg.length) {
    const keep: Array<[number, number]> = [];
    for (const [ci, midX] of midXs.entries()) {
      if (columnIsPureCurrencyPrefix(table, ci)) continue;
      keep.push([ci, midX]);
    }
    if (keep.length !== columnsCfg.length) return null;
    keep.sort((a, b) => a[1] - b[1]);
    const map = new Map<string, number>();
    for (let i = 0; i < columnsCfg.length; i++) {
      map.set(columnsCfg[i].prefix, keep[i][0]);
    }
    return map;
  }

  return null;
}

interface PositionalRowMapResult {
  rowMap: Map<string, number>;
  dominantOffset: number;
  topVotes: number;
  secondVotes: number;
}

function buildPositionalRowMap(
  table: Table,
  anchors: LabelAnchorHit[],
  rowsCfg: RecoveryRowConfig[],
  minVotes: number,
  dominanceRatio: number,
): PositionalRowMapResult | null {
  if (anchors.length === 0) return null;
  const rowMidYs = tableRowMidYs(table, 0);
  if (rowMidYs.size === 0) return null;

  const offsetVotes = new Map<number, number>();
  for (const a of anchors) {
    let nearest = Number.NaN;
    let bestDelta = Infinity;
    for (const [r, midY] of rowMidYs.entries()) {
      const d = Math.abs(midY - a.midY);
      if (d < bestDelta) {
        bestDelta = d;
        nearest = r;
      }
    }
    if (Number.isNaN(nearest)) continue;
    const offset = a.labelIndex - nearest;
    offsetVotes.set(offset, (offsetVotes.get(offset) ?? 0) + 1);
  }

  if (offsetVotes.size === 0) return null;

  const ranked = Array.from(offsetVotes.entries()).sort((a, b) => b[1] - a[1]);
  const [topOffset, topVotes] = ranked[0];
  const secondVotes = ranked.length > 1 ? ranked[1][1] : 0;
  if (topVotes < minVotes) return null;
  if (topVotes < dominanceRatio * secondVotes) return null;

  const rc = table.rowCount ?? 0;
  const rowMap = new Map<string, number>();
  for (let labelIndex = 0; labelIndex < rowsCfg.length; labelIndex++) {
    const ri = labelIndex - topOffset;
    if (ri >= 0 && ri < rc) rowMap.set(rowsCfg[labelIndex].suffix, ri);
  }
  return { rowMap, dominantOffset: topOffset, topVotes, secondVotes };
}

function findTableByPositionalAnchor(
  tables: Table[],
  paragraphs: Paragraph[],
  cfg: RecoveryTableConfig,
):
  | (LocateResult & {
      dominantOffset: number;
      topVotes: number;
      secondVotes: number;
    })
  | null {
  const fb = cfg.fallbackTableFinder;
  const pa = fb?.positionalAnchor;
  if (!pa) return null; // Group B disabled
  const minVotes = pa.minVotes ?? DEFAULT_MIN_VOTES;
  const dominanceRatio = pa.dominanceRatio ?? DEFAULT_DOMINANCE_RATIO;
  const candidates = candidateTablesByShape(tables, fb?.shape);
  for (const cand of candidates) {
    const columnMap = buildPositionalColumnMap(cand.table, cfg.columns);
    if (!columnMap) continue;
    const pageNo = tablePageNumber(cand.table);
    const anchors = findLabelParagraphAnchors(paragraphs, pageNo, cfg.rows);
    if (anchors.length === 0) continue;
    const r = buildPositionalRowMap(
      cand.table,
      anchors,
      cfg.rows,
      minVotes,
      dominanceRatio,
    );
    if (!r) continue;
    return {
      table: cand.table,
      index: cand.index,
      columnMap,
      rowMap: r.rowMap,
      strategy: "positional-anchor",
      dominantOffset: r.dominantOffset,
      topVotes: r.topVotes,
      secondVotes: r.secondVotes,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

function locateTable(
  tables: Table[],
  paragraphs: Paragraph[],
  cfg: RecoveryTableConfig,
): LocateResult | null {
  const title = findTableByTitle(tables, cfg.find);
  if (title) {
    const columnMap = resolveColumnIndexesByHeader(title.table, cfg.columns);
    const rowMap = resolveRowIndexesByLabel(title.table, cfg.rows);
    return { ...title, columnMap, rowMap, strategy: "title-anchor" };
  }
  const la = findTableByRowLabels(tables, cfg);
  if (la) return la;
  const pa = findTableByPositionalAnchor(tables, paragraphs, cfg);
  if (pa) {
    // Discard pa-only diagnostic fields when returning the common shape.
    return {
      table: pa.table,
      index: pa.index,
      columnMap: pa.columnMap,
      rowMap: pa.rowMap,
      strategy: pa.strategy,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

interface AppliedRecovery {
  fieldKey: string;
  prefix: string;
  suffix: string;
  tableIndex: number;
  rowIndex: number;
  columnIndex: number;
  cellContent: string;
  strategy: RecoveryStrategy;
}

interface SkippedRecovery {
  fieldKey: string;
  reason:
    | "field_already_populated"
    | "cell_not_found"
    | "cell_has_digits_or_letters"
    | "no_selection_mark_in_cell"
    | "field_not_in_documents";
}

export async function recoverNumericZerosFromCheckboxes(
  params: RecoverNumericZerosFromCheckboxesParams,
): Promise<CorrectionResult> {
  const log = createActivityLogger("recoverNumericZerosFromCheckboxes");
  const { ocrResult, tables: tableConfigs } = params;
  const changes: EnrichmentChange[] = [];
  const applied: AppliedRecovery[] = [];
  const skipped: SkippedRecovery[] = [];
  const unresolved: string[] = [];
  const tableFinderStrategy: Record<string, RecoveryStrategy | "not-found"> =
    {};

  log.info("Recover numeric zeros start", {
    event: "start",
    fileName: ocrResult.fileName,
    tableConfigCount: tableConfigs?.length ?? 0,
  });

  if (!tableConfigs || tableConfigs.length === 0) {
    log.info("Recover numeric zeros: no table configs supplied, no-op", {
      event: "noop",
      fileName: ocrResult.fileName,
    });
    return {
      ocrResult,
      changes: [],
      metadata: { applied: 0, skipped: 0, unresolved: 0, tableConfigCount: 0 },
    };
  }

  const result: OCRResult = deepCopyOcrResult(ocrResult);
  const doc = result.documents?.[0];
  if (!doc) {
    log.info(
      "Recover numeric zeros: no custom-model documents present, no-op",
      {
        event: "noop_no_documents",
        fileName: ocrResult.fileName,
      },
    );
    return {
      ocrResult: result,
      changes: [],
      metadata: {
        applied: 0,
        skipped: 0,
        unresolved: 0,
        tableConfigCount: tableConfigs.length,
      },
    };
  }

  for (let ti = 0; ti < tableConfigs.length; ti++) {
    const cfg = tableConfigs[ti];
    const recoveryValue = cfg.recoveryValue ?? 0;
    const stripTokens =
      cfg.cellEligibility?.stripBeforeCheck ?? DEFAULT_STRIP_TOKENS;
    const requireMark = cfg.cellEligibility?.requireSelectionMarkInCell ?? true;
    const acceptedStates = cfg.cellEligibility?.acceptedMarkStates;

    const located = locateTable(result.tables, result.paragraphs, cfg);
    if (!located) {
      tableFinderStrategy[`config_${ti}`] = "not-found";
      log.warn?.("Recover numeric zeros: target table not found", {
        event: "table_not_found",
        fileName: ocrResult.fileName,
        configIndex: ti,
        find: cfg.find,
        labelAnchorEnabled: Boolean(cfg.fallbackTableFinder?.labelAnchor),
        positionalAnchorEnabled: Boolean(
          cfg.fallbackTableFinder?.positionalAnchor,
        ),
      });
      continue;
    }
    const { table, index: tableIndex, columnMap, rowMap, strategy } = located;
    tableFinderStrategy[`config_${ti}`] = strategy;

    for (const col of cfg.columns) {
      if (columnMap.get(col.prefix) === undefined) {
        unresolved.push(`column:${col.prefix}`);
      }
    }
    for (const row of cfg.rows) {
      if (rowMap.get(row.suffix) === undefined) {
        unresolved.push(`row:${row.suffix}`);
      }
    }

    for (const row of cfg.rows) {
      const ri = rowMap.get(row.suffix);
      if (ri === undefined) continue;
      for (const col of cfg.columns) {
        const ci = columnMap.get(col.prefix);
        if (ci === undefined) continue;

        const fieldKey = `${col.prefix}${row.suffix}`;
        const field = doc.fields[fieldKey] as
          | AzureDocumentFieldValue
          | undefined;
        if (!field) {
          skipped.push({ fieldKey, reason: "field_not_in_documents" });
          continue;
        }
        if (!fieldIsEmpty(field)) {
          skipped.push({ fieldKey, reason: "field_already_populated" });
          continue;
        }
        const cell = getCell(table, ri, ci);
        if (!cell) {
          skipped.push({ fieldKey, reason: "cell_not_found" });
          continue;
        }
        if (!cellIsEligibleByContent(cell.content, stripTokens)) {
          skipped.push({ fieldKey, reason: "cell_has_digits_or_letters" });
          continue;
        }
        if (
          requireMark &&
          !cellHasSelectionMark(cell, result.pages, acceptedStates)
        ) {
          skipped.push({ fieldKey, reason: "no_selection_mark_in_cell" });
          continue;
        }

        const valueStr = String(recoveryValue);
        field.valueNumber = recoveryValue;
        field.content = valueStr;
        field.valueString = valueStr;

        const labelCell = getCell(table, ri, 0);
        const headerCell = getCell(table, 0, ci) ?? getCell(table, 1, ci);
        changes.push({
          fieldKey,
          originalValue: "",
          correctedValue: valueStr,
          reason: `Recovered ${valueStr} from misread checkbox in table via ${strategy} (row="${normalizeText(labelCell?.content ?? "")}" column="${normalizeText(headerCell?.content ?? "")}")`,
          source: "rule",
        });
        applied.push({
          fieldKey,
          prefix: col.prefix,
          suffix: row.suffix,
          tableIndex,
          rowIndex: ri,
          columnIndex: ci,
          cellContent: cell.content,
          strategy,
        });
      }
    }
  }

  const appliedByStrategy = applied.reduce<Record<string, number>>((acc, a) => {
    acc[a.strategy] = (acc[a.strategy] ?? 0) + 1;
    return acc;
  }, {});

  log.info("Recover numeric zeros complete", {
    event: "complete",
    fileName: ocrResult.fileName,
    appliedCount: applied.length,
    skippedCount: skipped.length,
    unresolvedCount: unresolved.length,
    appliedByStrategy,
    tableFinderStrategy,
  });

  return {
    ocrResult: result,
    changes,
    metadata: {
      applied: applied.length,
      skipped: skipped.length,
      unresolved: unresolved.length,
      tableConfigCount: tableConfigs.length,
      appliedFieldKeys: applied.map((a) => a.fieldKey),
      appliedByStrategy,
      tableFinderStrategy,
      skippedByReason: skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {}),
      unresolvedSelectors: unresolved,
    },
  };
}
