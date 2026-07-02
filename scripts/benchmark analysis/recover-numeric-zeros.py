#!/usr/bin/env python3
"""
Recover numeric zeros in a benchmark JSON that the custom Azure DI model
missed because the prebuilt-layout step parsed a `0` as a selection mark.

NOTE: This script is ONE STEP of the benchmark analysis pipeline. For a full
re-regeneration against share data (normalize → recover-zeros → analyze →
report-errors), use `regenerate-reports-share.sh`. Invoking this script
alone produces only partial results — downstream audit reports won't
reflect format-variant normalization or cross-engine deltas.

Three table-finder strategies are tried in order per configured table:

  1. Title anchor (the original strategy):
     find the OCR table whose first cell (r0c0) text contains the configured
     `find.firstCellTextContains` (or equals `find.firstCellTextEquals`).

  2. Row-label anchor (Group A fallback):
     when the title isn't found, scan candidate tables by shape
     (rowCount 18..21 × columnCount 2..3) for one where ≥12 of the
     configured row-label texts appear in column 0 (case-insensitive
     contains). The first such table wins; column mapping uses the
     existing header-text matcher.

  3. Positional anchor (Group B fallback):
     when neither title nor row-label match, look for a candidate
     by shape AND derive the row-index mapping via a loose-substring
     match on the page paragraphs: for each found label paragraph,
     pair its midY with the candidate table's row whose midY is
     closest, vote `offset = label_index - row_index`, and apply the
     dominant offset uniformly. Column mapping is derived by sorting
     the candidate's columns by midX and assigning them left-to-right
     to the config's prefixes; if the candidate has one more column
     than there are prefixes, the column whose cells are "pure
     currency prefix" (mostly just `$`/`€`/`£`/`¥`) is dropped.

     The positional anchor is gated by a dominance rule:
       top_votes >= 3 AND top_votes >= 2 * second_votes
     to avoid mis-mapping when the vote tally is split or sparse.

Per-cell eligibility (identical across all three strategies):
  - The cell's content has no digits and no letters after stripping
    configured tokens (default: `$`, `€`, `£`, `¥`, `:selected:`,
    `:unselected:`).
  - At least one `pages[].selectionMarks[*]` polygon overlaps the cell's
    bounding region.
  - The benchmark detail must currently be unmatched AND its `expected`
    must parse to the configured recovery value.

A flipped detail gets stamped with `matched: true`, `matchedVia:
"recovered:checkbox-zero"`, `recoveryStrategy:
"title-anchor"|"label-anchor"|"positional-anchor"`, and `recoveredValue:
<value>`. The CSV `rule` column reflects the strategy
("recovered:checkbox-zero", "recovered:checkbox-zero-label-anchor",
"recovered:checkbox-zero-positional") so downstream analysis can split
by source.

Mapping is driven entirely by an inline table config (SDPR built-in;
override with --table-config-json):

  - find.firstCellTextContains: text in cell r0c0 that identifies the table
  - columns[]: {prefix, headerEquals|headerContains}
  - rows[]:    {suffix, labelEquals|labelContains}
  - fieldKey = prefix + suffix

OCR cache input is consumed from stdin as length-delimited lines:
  <base64-sampleId> <base64-ocr-response-json>
This avoids paying disk I/O cost or surfacing sample IDs / payload bytes
in command-line arguments.

Outputs:
  --out      : path to write the mutated benchmark JSON (may be /dev/shm)
  --changes  : path to write the recovery audit CSV
                  columns: sampleId,field,rule,predicted,expected
                  (`predicted` is the value the model emitted before
                  recovery. Column order matches normalize-benchmark.py
                  so the two audits can be merged into a single CSV.)
  --merge-into-changes <path>
                When set, the script reads the given CSV first, drops any
                existing rows whose `rule` begins with "recovered:" (to
                avoid duplicates if you run the recovery twice), then
                appends the new recovery rows. The merged CSV is written
                to --changes. Use this to keep one combined audit log.

Diagnostics go to stderr — counts only, no values from the benchmark or
OCR cache.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Built-in SDPR table config (mirrors the workflow node's parameters.tables)
# ---------------------------------------------------------------------------

SDPR_TABLE_CONFIG: list[dict[str, Any]] = [
    {
        "find": {"firstCellTextContains": "Declare all income"},
        "columns": [
            {"prefix": "applicant_", "headerEquals": "Applicant"},
            {"prefix": "spouse_", "headerEquals": "Spouse"},
        ],
        "rows": [
            {"suffix": "net_employment_income", "labelEquals": "Net Employment Income"},
            {"suffix": "employment_insurance", "labelEquals": "Employment Insurance"},
            {"suffix": "spousal_support_alimony", "labelEquals": "Spousal Support / Alimony"},
            {"suffix": "child_support", "labelEquals": "Child Support"},
            {"suffix": "workbc_financial_support", "labelEquals": "WorkBC Financial Support"},
            {"suffix": "student_funding_loans_bursaries", "labelEquals": "Student Funding (eg: Loans, Bursaries)"},
            {"suffix": "rental_income", "labelEquals": "Rental Income"},
            {"suffix": "room_board_income", "labelEquals": "Room / Board Income"},
            {"suffix": "workers_compensation", "labelEquals": "Worker's Compensation"},
            {"suffix": "private_pensions_retirement_disability", "labelEquals": "Private Pensions (eg: Retirement, Disability)"},
            {"suffix": "oas_gis", "labelEquals": "OAS / GIS"},
            {"suffix": "trust_income", "labelEquals": "Trust Income"},
            {"suffix": "canada_pension_plan_cpp", "labelEquals": "Canada Pension Plan (CPP)"},
            {"suffix": "tax_credits_gst_credit", "labelEquals": "Tax Credits (eg: GST Credit)"},
            {"suffix": "child_tax_benefits", "labelEquals": "Child Tax Benefits"},
            {"suffix": "income_tax_refund", "labelEquals": "Income Tax Refund"},
            {"suffix": "other_income_money_received", "labelEquals": "All other income / money received"},
            {"suffix": "income_of_dependent_children", "labelEquals": "Income of Dependent Children"},
        ],
        "recoveryValue": 0,
        "cellEligibility": {
            "stripBeforeCheck": ["$", "€", "£", "¥", ":selected:", ":unselected:"],
            "requireSelectionMarkInCell": True,
        },
        "fallbackTableFinder": {
            "shape": {"minRowCount": 18, "maxRowCount": 21, "minColumnCount": 2, "maxColumnCount": 3},
            "labelAnchor": {"minLabelMatches": 12},
            "positionalAnchor": {"minVotes": 3, "dominanceRatio": 2.0},
        },
    },
]

DEFAULT_STRIP_TOKENS = ["$", "€", "£", "¥", ":selected:", ":unselected:"]
CURRENCY_TOKENS = ["$", "€", "£", "¥"]
RECOVERY_RULE_PREFIX = "recovered:checkbox-zero"
STRATEGY_RULES = {
    "title-anchor": "recovered:checkbox-zero",
    "label-anchor": "recovered:checkbox-zero-label-anchor",
    "positional-anchor": "recovered:checkbox-zero-positional",
}

# ---------------------------------------------------------------------------
# Text + geometry helpers
# ---------------------------------------------------------------------------


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_loose(value: Any) -> str:
    """Case-insensitive, whitespace-collapsed normalization for substring contains.
    Newlines and runs of whitespace become a single space."""
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip().lower()


def matches_equals(actual: str, expected: str | None) -> bool:
    if not expected:
        return False
    return normalize_text(actual).lower() == normalize_text(expected).lower()


def matches_contains(actual: str, expected: str | None) -> bool:
    if not expected:
        return False
    return normalize_text(expected).lower() in normalize_text(actual).lower()


def loose_contains(haystack: str, needle: str) -> bool:
    """Case+whitespace-normalized substring contains. Used by Group-B
    label-paragraph matching: longer paragraphs that wrap the label
    (e.g. "Net Employment Income $0") still match the label."""
    if not needle or not haystack:
        return False
    return normalize_loose(needle) in normalize_loose(haystack)


def polygon_bbox(polygon: list[float] | None) -> tuple[float, float, float, float] | None:
    if not polygon or len(polygon) < 4:
        return None
    xs = polygon[0::2]
    ys = polygon[1::2]
    return (min(xs), min(ys), max(xs), max(ys))


def bbox_overlaps(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def cell_is_eligible_by_content(
    content: str,
    strip_tokens: list[str],
    recovery_value: float | int | None = None,
) -> bool:
    """A cell is eligible if, after stripping the configured tokens and
    collapsing whitespace, ANY of these holds:
      - the remaining string is empty (the only thing in the cell was a
        currency/selection-mark marker — classic checkbox-as-zero pattern)
      - the remaining string contains no digits and no letters (e.g. lone
        punctuation left over after stripping)
      - the remaining string parses to the configured `recovery_value`
        (e.g. `'0'`, `'0.00'`, `'0,00'` when recovery_value=0). This
        covers cells where Azure DI's layout step recognized the digit
        AND a stray selection mark in the same cell — the custom model
        emitted null but the digit is provably present.
    The selection-mark-overlap gate is applied separately by the caller,
    so we still require a real checkbox glyph in the cell."""
    stripped = content
    for tok in strip_tokens:
        if not tok:
            continue
        stripped = re.sub(re.escape(tok), "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s+", "", stripped)
    if not stripped:
        return True
    if re.search(r"[A-Za-z0-9]", stripped) is None:
        return True
    if recovery_value is not None:
        try:
            parsed = float(stripped.replace(",", "."))
            return parsed == float(recovery_value)
        except ValueError:
            return False
    return False


def cell_has_selection_mark(cell: dict, pages: list[dict], accepted_states: list[str] | None = None) -> bool:
    regions = cell.get("boundingRegions") or []
    if not regions:
        return False
    region = regions[0]
    bbox = polygon_bbox(region.get("polygon"))
    if bbox is None:
        return False
    page_no = region.get("pageNumber")
    page = next((p for p in pages if p.get("pageNumber") == page_no), None)
    marks = (page or {}).get("selectionMarks") or []
    for m in marks:
        if accepted_states and m.get("state") not in accepted_states:
            continue
        mbox = polygon_bbox(m.get("polygon"))
        if mbox and bbox_overlaps(bbox, mbox):
            return True
    return False


def get_cell(table: dict, row_index: int, column_index: int) -> dict | None:
    return next(
        (
            c
            for c in (table.get("cells") or [])
            if c.get("rowIndex") == row_index and c.get("columnIndex") == column_index
        ),
        None,
    )


def parse_expected_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        s = s.replace("$", "").replace(",", "").replace(" ", "")
        try:
            return float(s)
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------------------
# Table geometry helpers
# ---------------------------------------------------------------------------


def table_page_number(table: dict) -> int | None:
    """Resolve which page the table lives on by looking at any cell's bbox."""
    for c in table.get("cells") or []:
        regs = c.get("boundingRegions") or []
        if regs and regs[0].get("pageNumber") is not None:
            return regs[0]["pageNumber"]
    return None


def table_row_midYs(table: dict, anchor_column: int = 0) -> dict[int, float]:
    """Return {row_index: midY} computed from cells in the given column.
    Falls back to any column when the anchor column lacks bboxes."""
    rc = table.get("rowCount") or 0
    midYs: dict[int, float] = {}
    for r in range(rc):
        candidates = [
            c for c in (table.get("cells") or [])
            if c.get("rowIndex") == r and c.get("columnIndex") == anchor_column
        ] or [c for c in (table.get("cells") or []) if c.get("rowIndex") == r]
        for c in candidates:
            regs = c.get("boundingRegions") or []
            if not regs:
                continue
            bx = polygon_bbox(regs[0].get("polygon"))
            if bx:
                midYs[r] = (bx[1] + bx[3]) / 2
                break
    return midYs


def table_col_midXs(table: dict) -> dict[int, float]:
    """Return {col_index: midX} averaged across whichever rows have bboxes."""
    cc = table.get("columnCount") or 0
    sums: dict[int, list[float]] = {ci: [] for ci in range(cc)}
    for c in table.get("cells") or []:
        ci = c.get("columnIndex")
        if not isinstance(ci, int) or ci < 0 or ci >= cc:
            continue
        regs = c.get("boundingRegions") or []
        if not regs:
            continue
        bx = polygon_bbox(regs[0].get("polygon"))
        if bx:
            sums[ci].append((bx[0] + bx[2]) / 2)
    return {ci: (sum(xs) / len(xs)) for ci, xs in sums.items() if xs}


def column_is_pure_currency_prefix(table: dict, col_idx: int) -> bool:
    """True if ≥70% of the column's cells contain only currency prefixes
    (no digits/letters after stripping `$ € £ ¥` + whitespace)."""
    col_cells = [c for c in (table.get("cells") or []) if c.get("columnIndex") == col_idx]
    if not col_cells:
        return False
    pure = 0
    for c in col_cells:
        content = c.get("content", "") or ""
        stripped = content
        for tok in CURRENCY_TOKENS:
            stripped = stripped.replace(tok, "")
        stripped = re.sub(r"\s+", "", stripped)
        if stripped == "":
            pure += 1
    return pure >= 0.7 * len(col_cells)


# ---------------------------------------------------------------------------
# Strategy 1 — Title anchor
# ---------------------------------------------------------------------------


def find_table_by_title(tables: list[dict], find_cfg: dict) -> tuple[dict, int] | None:
    for i, table in enumerate(tables):
        first_cell = next(
            (c for c in (table.get("cells") or []) if c.get("rowIndex") == 0 and c.get("columnIndex") == 0),
            None,
        )
        content = (first_cell or {}).get("content", "") or ""
        eq = find_cfg.get("firstCellTextEquals")
        ct = find_cfg.get("firstCellTextContains")
        if eq and matches_equals(content, eq):
            return table, i
        if ct and matches_contains(content, ct):
            return table, i
    return None


def resolve_column_indexes_by_header(table: dict, columns: list[dict]) -> dict[str, int]:
    """Column → prefix via configured header text. Used by title and label-anchor strategies."""
    out: dict[str, int] = {}
    cells = table.get("cells") or []
    header_cells = [
        c
        for c in cells
        if c.get("kind") == "columnHeader"
        or (c.get("rowIndex") in (0, 1) and len(normalize_text(c.get("content"))) > 0)
    ]
    for col in columns:
        hit = next(
            (
                c
                for c in header_cells
                if matches_equals(c.get("content", ""), col.get("headerEquals"))
                or matches_contains(c.get("content", ""), col.get("headerContains"))
            ),
            None,
        )
        if hit is not None:
            out[col["prefix"]] = hit["columnIndex"]
    return out


def resolve_row_indexes_by_label(table: dict, rows: list[dict]) -> dict[str, int]:
    """Row → suffix via configured label text in column 0. Used by title and label-anchor strategies."""
    out: dict[str, int] = {}
    cells = table.get("cells") or []
    label_cells = [c for c in cells if c.get("columnIndex") == 0]
    for row in rows:
        hit = next(
            (
                c
                for c in label_cells
                if matches_equals(c.get("content", ""), row.get("labelEquals"))
                or matches_contains(c.get("content", ""), row.get("labelContains"))
            ),
            None,
        )
        if hit is not None:
            out[row["suffix"]] = hit["rowIndex"]
    return out


# ---------------------------------------------------------------------------
# Shape filter shared by Group A + Group B
# ---------------------------------------------------------------------------


def candidate_tables_by_shape(tables: list[dict], shape_cfg: dict) -> list[tuple[int, dict]]:
    min_rc = shape_cfg.get("minRowCount", 18)
    max_rc = shape_cfg.get("maxRowCount", 21)
    min_cc = shape_cfg.get("minColumnCount", 2)
    max_cc = shape_cfg.get("maxColumnCount", 3)
    out: list[tuple[int, dict]] = []
    for i, t in enumerate(tables):
        rc = t.get("rowCount")
        cc = t.get("columnCount")
        if not isinstance(rc, int) or not isinstance(cc, int):
            continue
        if min_rc <= rc <= max_rc and min_cc <= cc <= max_cc:
            out.append((i, t))
    return out


# ---------------------------------------------------------------------------
# Strategy 2 — Row-label anchor (Group A)
# ---------------------------------------------------------------------------


def find_table_by_row_labels(
    tables: list[dict],
    cfg: dict,
) -> tuple[dict, int, dict[str, int], dict[str, int]] | None:
    """Locate the income table by finding a candidate whose column-0 cells
    contain enough configured row-label texts. Returns (table, table_index,
    column_map, row_map) on success."""
    fb = cfg.get("fallbackTableFinder") or {}
    shape = fb.get("shape") or {}
    min_matches = (fb.get("labelAnchor") or {}).get("minLabelMatches", 12)

    candidates = candidate_tables_by_shape(tables, shape)
    for ti, t in candidates:
        row_map = resolve_row_indexes_by_label(t, cfg["rows"])
        if len(row_map) >= min_matches:
            column_map = resolve_column_indexes_by_header(t, cfg["columns"])
            return t, ti, column_map, row_map
    return None


# ---------------------------------------------------------------------------
# Strategy 3 — Positional anchor via offset vote (Group B)
# ---------------------------------------------------------------------------


def find_label_paragraph_anchors(
    analyze_result: dict,
    page_no: int | None,
    rows_cfg: list[dict],
) -> list[tuple[int, str, float]]:
    """Return [(label_index, suffix, midY), …] for every expected row label
    found via loose substring on a page paragraph. First paragraph hit per
    label only."""
    out: list[tuple[int, str, float]] = []
    paras = analyze_result.get("paragraphs") or []
    same_page = []
    for p in paras:
        regs = p.get("boundingRegions") or []
        if not regs:
            continue
        if page_no is not None and regs[0].get("pageNumber") != page_no:
            continue
        bx = polygon_bbox(regs[0].get("polygon"))
        if not bx:
            continue
        same_page.append({"text": (p.get("content") or ""), "midY": (bx[1] + bx[3]) / 2})

    for label_idx, row in enumerate(rows_cfg):
        needle = row.get("labelEquals") or row.get("labelContains") or ""
        if not needle:
            continue
        for p in same_page:
            if loose_contains(p["text"], needle):
                out.append((label_idx, row["suffix"], p["midY"]))
                break
    return out


def build_positional_column_map(
    table: dict,
    columns_cfg: list[dict],
) -> dict[str, int] | None:
    """Sort the candidate table's columns by midX and assign left→right to
    the config's prefixes. If the candidate has one more column than there
    are prefixes, drop the column(s) whose cells are predominantly
    pure-currency-prefix. Returns {prefix: col_idx} or None."""
    midXs = table_col_midXs(table)
    cc = table.get("columnCount") or 0
    if len(midXs) < len(columns_cfg):
        return None  # not enough columns with bboxes

    # If columnCount matches prefix count, direct sort+map.
    if cc == len(columns_cfg):
        sorted_cols = sorted(midXs.items(), key=lambda kv: kv[1])
        return {col["prefix"]: ci for col, (ci, _x) in zip(columns_cfg, sorted_cols)}

    # If there are more columns than prefixes, drop pure-currency columns
    # until counts match. If we can't reduce to the exact count, refuse.
    if cc > len(columns_cfg):
        keep = []
        for ci, midX in midXs.items():
            if column_is_pure_currency_prefix(table, ci):
                continue
            keep.append((ci, midX))
        if len(keep) != len(columns_cfg):
            return None
        keep_sorted = sorted(keep, key=lambda x: x[1])
        return {col["prefix"]: ci for col, (ci, _x) in zip(columns_cfg, keep_sorted)}

    return None


def build_positional_row_map(
    table: dict,
    anchors: list[tuple[int, str, float]],
    rows_cfg: list[dict],
    min_votes: int,
    dominance_ratio: float,
) -> tuple[dict[str, int], int, int, int] | None:
    """Vote on `offset = label_index - row_index` per anchor. If the top
    offset has ≥min_votes AND ≥(dominance_ratio × second_votes), apply it
    uniformly. Returns (row_map, dominant_offset, top_votes, second_votes)
    on success. row_map only includes rows that land within the table's
    actual row range."""
    if not anchors:
        return None
    row_midYs = table_row_midYs(table, anchor_column=0)
    if not row_midYs:
        return None
    offset_votes: Counter = Counter()
    for label_idx, _suffix, lab_y in anchors:
        nearest_row = min(row_midYs.items(), key=lambda kv: abs(kv[1] - lab_y))[0]
        offset_votes[label_idx - nearest_row] += 1
    ranked = offset_votes.most_common()
    if not ranked:
        return None
    top_offset, top_votes = ranked[0]
    second_votes = ranked[1][1] if len(ranked) > 1 else 0
    if top_votes < min_votes:
        return None
    if top_votes < dominance_ratio * second_votes:
        return None

    rc = table.get("rowCount") or 0
    row_map: dict[str, int] = {}
    for label_idx, row in enumerate(rows_cfg):
        ri = label_idx - top_offset
        if 0 <= ri < rc:
            row_map[row["suffix"]] = ri
    return row_map, top_offset, top_votes, second_votes


def find_table_by_positional_anchor(
    tables: list[dict],
    analyze_result: dict,
    cfg: dict,
) -> tuple[dict, int, dict[str, int], dict[str, int], int] | None:
    """Group-B fallback. Returns (table, idx, column_map, row_map, dominant_offset)."""
    fb = cfg.get("fallbackTableFinder") or {}
    shape = fb.get("shape") or {}
    pa = fb.get("positionalAnchor") or {}
    min_votes = int(pa.get("minVotes", 3))
    dominance_ratio = float(pa.get("dominanceRatio", 2.0))

    candidates = candidate_tables_by_shape(tables, shape)
    for ti, t in candidates:
        column_map = build_positional_column_map(t, cfg["columns"])
        if column_map is None:
            continue
        page_no = table_page_number(t)
        anchors = find_label_paragraph_anchors(analyze_result, page_no, cfg["rows"])
        if not anchors:
            continue
        result = build_positional_row_map(t, anchors, cfg["rows"], min_votes, dominance_ratio)
        if result is None:
            continue
        row_map, dominant_offset, _, _ = result
        return t, ti, column_map, row_map, dominant_offset
    return None


# ---------------------------------------------------------------------------
# Per-sample recovery (orchestrates the three strategies + cell eligibility)
# ---------------------------------------------------------------------------


def locate_table(
    tables: list[dict],
    analyze_result: dict,
    cfg: dict,
) -> tuple[dict, int, dict[str, int], dict[str, int], str] | None:
    """Try title → label-anchor → positional-anchor. Returns
    (table, table_index, column_map, row_map, strategy_name) or None."""
    # 1. Title
    located = find_table_by_title(tables, cfg.get("find") or {})
    if located is not None:
        table, idx = located
        column_map = resolve_column_indexes_by_header(table, cfg["columns"])
        row_map = resolve_row_indexes_by_label(table, cfg["rows"])
        return table, idx, column_map, row_map, "title-anchor"

    # 2. Label anchor (Group A)
    la = find_table_by_row_labels(tables, cfg)
    if la is not None:
        table, idx, column_map, row_map = la
        return table, idx, column_map, row_map, "label-anchor"

    # 3. Positional anchor (Group B)
    pa = find_table_by_positional_anchor(tables, analyze_result, cfg)
    if pa is not None:
        table, idx, column_map, row_map, _offset = pa
        return table, idx, column_map, row_map, "positional-anchor"

    return None


def recover_for_sample(
    sample: dict,
    ocr_cache_entry: dict | None,
    table_configs: list[dict],
) -> list[dict]:
    """Mutate `sample.evaluationDetails` in-place. Return the list of recoveries applied."""
    sid = sample.get("sampleId", "?")
    details = sample.get("evaluationDetails") or []
    if not details or not ocr_cache_entry:
        return []

    analyze_result = (ocr_cache_entry.get("analyzeResult") or {})
    tables = analyze_result.get("tables") or []
    pages = analyze_result.get("pages") or []
    if not tables:
        return []

    recoveries: list[dict] = []
    detail_by_field = {d.get("field"): d for d in details if isinstance(d.get("field"), str)}

    for cfg in table_configs:
        recovery_value = cfg.get("recoveryValue", 0)
        elig = cfg.get("cellEligibility") or {}
        strip_tokens = elig.get("stripBeforeCheck") or DEFAULT_STRIP_TOKENS
        require_mark = elig.get("requireSelectionMarkInCell", True)
        accepted_states = elig.get("acceptedMarkStates") or None

        located = locate_table(tables, analyze_result, cfg)
        if located is None:
            continue
        table, table_index, column_map, row_map, strategy = located
        rule_label = STRATEGY_RULES[strategy]

        for row in cfg["rows"]:
            ri = row_map.get(row["suffix"])
            if ri is None:
                continue
            for col in cfg["columns"]:
                ci = column_map.get(col["prefix"])
                if ci is None:
                    continue
                field_key = f"{col['prefix']}{row['suffix']}"
                detail = detail_by_field.get(field_key)
                if detail is None:
                    continue

                # Idempotency: if this detail was already flipped by any
                # recovery strategy, re-emit the audit row but skip
                # mutation. The strategy of the prior run is preserved.
                prior_via = detail.get("matchedVia") or ""
                already_recovered = (
                    detail.get("matched") is True
                    and isinstance(prior_via, str)
                    and prior_via == "recovered:checkbox-zero"
                )
                if detail.get("matched") is True and not already_recovered:
                    continue

                # Only recover when expected parses to the configured value.
                exp_num = parse_expected_number(detail.get("expected"))
                if exp_num is None or float(exp_num) != float(recovery_value):
                    continue
                cell = get_cell(table, ri, ci)
                if cell is None:
                    continue
                if not cell_is_eligible_by_content(
                    cell.get("content", "") or "", strip_tokens, recovery_value
                ):
                    continue
                if require_mark and not cell_has_selection_mark(cell, pages, accepted_states):
                    continue

                prior_predicted = detail.get("predicted")
                effective_strategy = strategy
                if already_recovered:
                    # Preserve the prior strategy if it was set, else default to title-anchor.
                    effective_strategy = detail.get("recoveryStrategy") or "title-anchor"
                else:
                    detail["matched"] = True
                    detail["matchedVia"] = "recovered:checkbox-zero"
                    detail["recoveredValue"] = recovery_value
                    detail["recoveryStrategy"] = strategy

                recoveries.append(
                    {
                        "sampleId": sid,
                        "field": field_key,
                        "rule": STRATEGY_RULES[effective_strategy],
                        "strategy": effective_strategy,
                        "expected": detail.get("expected"),
                        "priorPredicted": prior_predicted,
                        "tableIndex": table_index,
                        "rowIndex": ri,
                        "columnIndex": ci,
                        "alreadyRecovered": already_recovered,
                    }
                )
    return recoveries


# ---------------------------------------------------------------------------
# perFieldResults rebuild (compatible with normalize-benchmark.py)
# ---------------------------------------------------------------------------


def mean_or_none(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def recompute_per_field_results(per_sample_results: list[dict]) -> list[dict]:
    by_field: dict[str, list[tuple[dict, str]]] = {}
    for sample in per_sample_results:
        sid = sample.get("sampleId", "?")
        for det in sample.get("evaluationDetails") or []:
            name = det.get("field")
            if not isinstance(name, str):
                continue
            by_field.setdefault(name, []).append((det, sid))

    out: list[dict] = []
    for name in sorted(by_field):
        details = by_field[name]
        evaluated = len(details)
        correct = sum(1 for d, _ in details if d.get("matched") is True)
        errors = evaluated - correct
        all_conf = [d.get("confidence") for d, _ in details if isinstance(d.get("confidence"), (int, float))]
        correct_conf = [d.get("confidence") for d, _ in details
                        if d.get("matched") is True and isinstance(d.get("confidence"), (int, float))]
        error_conf = [d.get("confidence") for d, _ in details
                      if d.get("matched") is False and isinstance(d.get("confidence"), (int, float))]
        error_entries: list[dict] = []
        for d, sid in details:
            if d.get("matched") is not False:
                continue
            error_entries.append(
                {
                    "sampleId": sid,
                    "expected": d.get("expected"),
                    "predicted": d.get("predicted"),
                    "confidence": d.get("confidence"),
                    "matched": False,
                }
            )
        out.append(
            {
                "name": name,
                "evaluatedCount": evaluated,
                "correctCount": correct,
                "errorCount": errors,
                "errorRate": (errors / evaluated) if evaluated else 0.0,
                "accuracy": (correct / evaluated) if evaluated else 0.0,
                "averageConfidence": mean_or_none(all_conf),
                "averageConfidenceCorrect": mean_or_none(correct_conf),
                "averageConfidenceErrors": mean_or_none(error_conf),
                "errors": error_entries,
            }
        )
    return out


# ---------------------------------------------------------------------------
# OCR cache stream loader (stdin: <b64-sid> <b64-bytes>\n per row)
# ---------------------------------------------------------------------------


def load_ocr_cache_from_stream(stream: Iterable[bytes]) -> dict[str, dict]:
    """Parse the OCR cache stream and return a dict {sampleId: parsed_ocr_response}."""
    cache: dict[str, dict] = {}
    rejected = 0
    for raw in stream:
        line = raw.rstrip(b"\r\n")
        if not line:
            continue
        sp = line.find(b" ")
        if sp < 1 or sp >= len(line) - 1:
            rejected += 1
            continue
        enc_sid = line[:sp]
        enc_data = line[sp + 1 :]
        try:
            sid = base64.b64decode(enc_sid).decode("utf-8", errors="replace")
            data_bytes = base64.b64decode(enc_data)
            payload = json.loads(data_bytes.decode("utf-8"))
        except Exception:
            rejected += 1
            continue
        cache[sid] = payload
    sys.stderr.write(f"ocr-cache stream: loaded={len(cache)} rejected={rejected}\n")
    return cache


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def serialize_value_for_csv(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("benchmark", help="benchmark JSON path (may be /dev/fd/N)")
    ap.add_argument("--out", required=True, help="output mutated benchmark JSON")
    ap.add_argument("--changes", required=True, help="recovery audit CSV")
    ap.add_argument(
        "--ocr-cache-stream",
        default="-",
        help="path to OCR-cache stream (default: stdin). Format: <b64-sid> <b64-bytes>\\n per line",
    )
    ap.add_argument(
        "--table-config-json",
        default=None,
        help="optional path to a JSON file overriding the built-in SDPR table config",
    )
    ap.add_argument(
        "--strip-sample-id-suffix",
        default="",
        help="optional suffix (e.g. '.jpg') to strip from OCR-cache sample IDs before matching",
    )
    ap.add_argument(
        "--merge-into-changes",
        default=None,
        help="optional existing changes CSV to merge with. Existing rows are preserved except any whose rule starts with 'recovered:' (those are replaced).",
    )
    args = ap.parse_args(argv)

    # Load OCR cache from stream
    if args.ocr_cache_stream == "-":
        ocr_cache = load_ocr_cache_from_stream(iter(sys.stdin.buffer))
    else:
        with open(args.ocr_cache_stream, "rb") as f:
            ocr_cache = load_ocr_cache_from_stream(iter(f))

    if args.strip_sample_id_suffix:
        suffix = args.strip_sample_id_suffix
        ocr_cache = {
            (k[: -len(suffix)] if k.endswith(suffix) else k): v for k, v in ocr_cache.items()
        }

    if not ocr_cache:
        sys.stderr.write("error: OCR cache stream is empty\n")
        return 2

    # Load benchmark JSON
    raw_text = Path(args.benchmark).read_text("utf-8")
    raw = json.loads(raw_text)

    # Load table config
    if args.table_config_json:
        table_configs = json.loads(Path(args.table_config_json).read_text("utf-8"))
    else:
        table_configs = SDPR_TABLE_CONFIG

    # Mutate
    samples = raw.get("perSampleResults") or []
    all_recoveries: list[dict] = []
    missing_ocr_cache_for: list[str] = []
    for sample in samples:
        sid = sample.get("sampleId", "?")
        cache_entry = ocr_cache.get(sid)
        if cache_entry is None:
            for sfx in (".jpg", ".jpeg", ".png", ".pdf", ".tif", ".tiff"):
                if sid.endswith(sfx) and sid[: -len(sfx)] in ocr_cache:
                    cache_entry = ocr_cache[sid[: -len(sfx)]]
                    break
        if cache_entry is None:
            for sfx in (".jpg", ".jpeg", ".png", ".pdf", ".tif", ".tiff"):
                if sid + sfx in ocr_cache:
                    cache_entry = ocr_cache[sid + sfx]
                    break
        if cache_entry is None:
            missing_ocr_cache_for.append(sid)
            continue
        all_recoveries.extend(recover_for_sample(sample, cache_entry, table_configs))

    # Rebuild perFieldResults
    raw["perFieldResults"] = recompute_per_field_results(samples)

    # Stamp the recovery marker.
    by_strategy = Counter(r["strategy"] for r in all_recoveries if not r.get("alreadyRecovered"))
    raw.setdefault("numericZeroRecovery", {}).update(
        {
            "appliedBy": "scripts/benchmark analysis/recover-numeric-zeros.py",
            "flippedCount": sum(1 for r in all_recoveries if not r.get("alreadyRecovered")),
            "reEmittedCount": sum(1 for r in all_recoveries if r.get("alreadyRecovered")),
            "samplesMissingOcrCache": len(missing_ocr_cache_for),
            "byStrategy": dict(by_strategy),
        }
    )

    # Write benchmark JSON
    Path(args.out).write_text(json.dumps(raw, ensure_ascii=False, indent=2), "utf-8")

    # Recovery CSV rows
    recovery_rows: list[list[str]] = []
    for r in all_recoveries:
        recovery_rows.append(
            [
                r["sampleId"],
                r["field"],
                r["rule"],
                serialize_value_for_csv(r["priorPredicted"]),
                serialize_value_for_csv(r["expected"]),
            ]
        )

    merged_existing_count = 0
    merged_rows: list[list[str]] = []
    if args.merge_into_changes:
        with open(args.merge_into_changes, "r", newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            expected_header = ["sampleId", "field", "rule", "predicted", "expected"]
            if header != expected_header:
                sys.stderr.write(
                    f"warning: existing changes CSV header {header!r} does not match expected {expected_header!r}; merging anyway by column position\n"
                )
            for row in reader:
                if not row:
                    continue
                rule = row[2] if len(row) > 2 else ""
                if isinstance(rule, str) and rule.startswith(RECOVERY_RULE_PREFIX):
                    continue
                merged_rows.append(row)
                merged_existing_count += 1

    merged_rows.extend(recovery_rows)

    with open(args.changes, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sampleId", "field", "rule", "predicted", "expected"])
        for row in merged_rows:
            w.writerow(row)

    # Stderr summary
    by_field = Counter(r["field"] for r in all_recoveries)
    newly_flipped = sum(1 for r in all_recoveries if not r.get("alreadyRecovered"))
    re_emitted = sum(1 for r in all_recoveries if r.get("alreadyRecovered"))
    sys.stderr.write(
        f"recovery rows: {len(all_recoveries)} (newly flipped: {newly_flipped}, re-emitted from prior run: {re_emitted}) across {len(samples)} samples\n"
    )
    sys.stderr.write(f"  by strategy (new flips only): {dict(by_strategy)}\n")
    sys.stderr.write(f"  samples missing OCR cache: {len(missing_ocr_cache_for)}\n")
    if args.merge_into_changes:
        sys.stderr.write(
            f"  changes CSV merge: kept {merged_existing_count} prior rows + appended {len(recovery_rows)} recovery rows = {merged_existing_count + len(recovery_rows)} total\n"
        )
    if len(by_field) <= 25:
        sys.stderr.write(f"  by field: {dict(sorted(by_field.items()))}\n")
    else:
        top = sorted(by_field.items(), key=lambda x: -x[1])[:10]
        sys.stderr.write(f"  top 10 fields: {top}  (+{len(by_field) - 10} more)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
