/**
 * Activity: Recover numeric values from misread checkboxes
 *
 * Azure Document Intelligence sometimes parses a handwritten or printed "0" as
 * a selection mark (open circle ≈ unselected checkbox). For custom-model fields
 * declared as `number`, this manifests as an empty value (`null` for template
 * models, `valueString: ""` for neural models) instead of the intended `0`.
 *
 * This activity recovers those zeros (or any configured numeric value) using
 * the OCR layout: tables, table cells, and page-level selection marks. The
 * mapping from a table cell to a custom-model field is fully configurable via
 * activity parameters (no schema or DB changes required). The activity is
 * generic and works for any form with currency/numeric table cells whose
 * positions are encoded by the prebuilt-layout step.
 *
 * Detection rule (cell-level; applied independently per configured table):
 *   1. The cell content, after stripping configured tokens (default: "$",
 *      ":selected:", ":unselected:"), must contain no digits and no letters.
 *   2. At least one `pages[].selectionMarks[*]` polygon must overlap the
 *      cell's bounding region.
 *   3. The mapped `documents[0].fields[fieldKey]` must currently be empty
 *      (no `valueNumber`/`valueInteger` and `valueString`/`content` empty).
 *
 * Mapping (per table config):
 *   - `find.firstCellTextContains`: locates the table by text in cell r0c0.
 *   - `columns[]`: maps each prefix to the column whose header equals/contains
 *     the configured text (after row 0).
 *   - `rows[]`: maps each field suffix to the row whose col-0 label equals/
 *     contains the configured text.
 *   - `fieldKey = columns[i].prefix + rows[j].suffix`.
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
  Page,
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
}

export interface RecoverNumericZerosFromCheckboxesParams
  extends CorrectionToolParams {
  /** Per-table recovery rules. Activity is a no-op when empty/omitted. */
  tables?: RecoveryTableConfig[];
}

const DEFAULT_STRIP_TOKENS = ["$", "€", "£", "¥", ":selected:", ":unselected:"];

function normalizeText(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
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

function findTable(
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

function resolveColumnIndexes(
  table: Table,
  columns: RecoveryColumnConfig[],
): Map<string, number> {
  const map = new Map<string, number>();
  // Header cells: any cell flagged columnHeader, OR cells in row 0/1 with non-empty content.
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
    if (hit) {
      map.set(col.prefix, hit.columnIndex);
    }
  }
  return map;
}

function resolveRowIndexes(
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
    if (hit) {
      map.set(row.suffix, hit.rowIndex);
    }
  }
  return map;
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

/** Axis-aligned bounding box of a polygon expressed as [x1,y1,x2,y2,...]. */
function polygonBBox(
  polygon: number[],
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
    // Escape regex metachars in the token; replace globally, case-insensitive.
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    stripped = stripped.replace(new RegExp(escaped, "gi"), "");
  }
  stripped = stripped.replace(/\s+/g, "");
  if (stripped.length === 0) return true;
  // Reject if any digit or letter remains — those represent a real value the
  // model may have extracted (e.g. "$0", "$1500") and we must never overwrite.
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

interface AppliedRecovery {
  fieldKey: string;
  prefix: string;
  suffix: string;
  tableIndex: number;
  rowIndex: number;
  columnIndex: number;
  cellContent: string;
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

  const result = deepCopyOcrResult(ocrResult);
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

    const located = findTable(result.tables, cfg.find);
    if (!located) {
      log.warn?.("Recover numeric zeros: target table not found", {
        event: "table_not_found",
        fileName: ocrResult.fileName,
        configIndex: ti,
        find: cfg.find,
      });
      continue;
    }
    const { table, index: tableIndex } = located;

    const columnMap = resolveColumnIndexes(table, cfg.columns);
    const rowMap = resolveRowIndexes(table, cfg.rows);

    for (const col of cfg.columns) {
      const ci = columnMap.get(col.prefix);
      if (ci === undefined) {
        unresolved.push(`column:${col.prefix}`);
      }
    }
    for (const row of cfg.rows) {
      const ri = rowMap.get(row.suffix);
      if (ri === undefined) {
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
          reason: `Recovered ${valueStr} from misread checkbox in table (row="${normalizeText(labelCell?.content ?? "")}" column="${normalizeText(headerCell?.content ?? "")}")`,
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
        });
      }
    }
  }

  log.info("Recover numeric zeros complete", {
    event: "complete",
    fileName: ocrResult.fileName,
    appliedCount: applied.length,
    skippedCount: skipped.length,
    unresolvedCount: unresolved.length,
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
      skippedByReason: skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {}),
      unresolvedSelectors: unresolved,
    },
  };
}
