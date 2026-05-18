#!/usr/bin/env python3
"""
Dump per-sample diagnostic markdown for every benchmark sample that still
has at least one (`expected == 0`, unmatched) detail after the recovery
pass. The dumps are human-review fodder: the income table cells, the page
selection-mark counts that fall inside each cell, and the recovery
algorithm's verdict + reason for every cell that should have flipped but
did not.

This is the "why didn't it recover?" companion to recover-numeric-zeros.py.
Same eligibility logic, but instead of mutating the benchmark it explains
the decision per cell so the reviewer can see whether the strip-token list,
the bbox-overlap check, or the cell content itself is the blocker.

Output (per affected sample): one markdown file at
    <out-dir>/<sanitized-sampleId>.md

Content per file:
    1. Header listing the unmatched expected-0 fields.
    2. Each configured table dumped as a markdown grid (cell content
       only). Cells targeted by an unmatched field are marked ⚠.
    3. Per-field diagnostic block: the matched cell, the recovery verdict
       (FLIP / SKIP), and the failing gate when SKIP, including:
         - cell content (raw)
         - cell content after strip-token cleanup (what the digit/letter
           test actually saw)
         - count + states of selection marks overlapping the cell bbox
         - the bbox coords + page number
       so the reviewer can decide whether to extend strip-tokens, relax the
       overlap requirement, or fix the cell-mapping config.

OCR cache stream format (stdin or --ocr-cache-stream): same as
recover-numeric-zeros.py — `<base64-sid> <base64-bytes>\n` per row.

Diagnostic counts only on stderr; never the sample IDs or any cell content.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Built-in SDPR table config (must mirror recover-numeric-zeros.py)
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
    },
]
DEFAULT_STRIP_TOKENS = ["$", "€", "£", "¥", ":selected:", ":unselected:"]

# ---------------------------------------------------------------------------
# Geometry + text helpers (mirror recover-numeric-zeros.py)
# ---------------------------------------------------------------------------


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def matches_equals(actual: str, expected: str | None) -> bool:
    if not expected:
        return False
    return normalize_text(actual).lower() == normalize_text(expected).lower()


def matches_contains(actual: str, expected: str | None) -> bool:
    if not expected:
        return False
    return normalize_text(expected).lower() in normalize_text(actual).lower()


def polygon_bbox(polygon: list[float] | None) -> tuple[float, float, float, float] | None:
    if not polygon or len(polygon) < 4:
        return None
    xs = polygon[0::2]
    ys = polygon[1::2]
    return (min(xs), min(ys), max(xs), max(ys))


def bbox_overlaps(
    a: tuple[float, float, float, float], b: tuple[float, float, float, float]
) -> bool:
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def cell_strip(content: str, strip_tokens: list[str]) -> str:
    stripped = content
    for tok in strip_tokens:
        if not tok:
            continue
        stripped = re.sub(re.escape(tok), "", stripped, flags=re.IGNORECASE)
    return re.sub(r"\s+", "", stripped)


def cell_is_eligible_by_content(content: str, strip_tokens: list[str]) -> bool:
    stripped = cell_strip(content, strip_tokens)
    if not stripped:
        return True
    return re.search(r"[A-Za-z0-9]", stripped) is None


def marks_overlapping_cell(
    cell: dict, pages: list[dict]
) -> list[dict]:
    regions = cell.get("boundingRegions") or []
    if not regions:
        return []
    region = regions[0]
    cell_box = polygon_bbox(region.get("polygon"))
    if cell_box is None:
        return []
    page_no = region.get("pageNumber")
    page = next((p for p in pages if p.get("pageNumber") == page_no), None)
    marks = (page or {}).get("selectionMarks") or []
    out = []
    for m in marks:
        mbox = polygon_bbox(m.get("polygon"))
        if mbox and bbox_overlaps(cell_box, mbox):
            out.append({"state": m.get("state"), "confidence": m.get("confidence"), "polygon": m.get("polygon")})
    return out


def find_table(tables: list[dict], find_cfg: dict) -> tuple[dict, int] | None:
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


def resolve_column_indexes(table: dict, columns: list[dict]) -> dict[str, int]:
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


def resolve_row_indexes(table: dict, rows: list[dict]) -> dict[str, int]:
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
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip().replace("$", "").replace(",", "").replace(" ", "")
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------------------
# Markdown formatting
# ---------------------------------------------------------------------------


def md_escape_cell(value: str | None) -> str:
    s = "" if value is None else str(value)
    s = s.replace("|", "\\|").replace("\n", "<br>").replace("\r", "")
    return s


def render_table_markdown(table: dict, targeted_cells: set[tuple[int, int]]) -> str:
    """Render an Azure DI table as a markdown grid. Targeted (row,col) cells
    get a leading ⚠ so they're easy to spot when reviewing."""
    cells_by_pos: dict[tuple[int, int], dict] = {}
    max_row = 0
    max_col = 0
    for c in table.get("cells") or []:
        r = c.get("rowIndex")
        co = c.get("columnIndex")
        if not isinstance(r, int) or not isinstance(co, int):
            continue
        cells_by_pos[(r, co)] = c
        if r > max_row:
            max_row = r
        if co > max_col:
            max_col = co

    declared_rows = table.get("rowCount") or (max_row + 1)
    declared_cols = table.get("columnCount") or (max_col + 1)

    # Header row: column indexes
    header = ["row \\ col"] + [str(ci) for ci in range(declared_cols)]
    sep = ["---"] * len(header)
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(sep) + " |"]
    for ri in range(declared_rows):
        row_cells = [str(ri)]
        for ci in range(declared_cols):
            cell = cells_by_pos.get((ri, ci))
            text = (cell or {}).get("content", "") or ""
            mark = "⚠ " if (ri, ci) in targeted_cells else ""
            row_cells.append(mark + md_escape_cell(text))
        lines.append("| " + " | ".join(row_cells) + " |")
    return "\n".join(lines)


def render_sample_markdown(
    sample_id: str,
    missing_fields_details: list[dict],
    analyze_result: dict,
    table_configs: list[dict],
) -> tuple[str, dict]:
    """Return (markdown_text, per_sample_stats)."""
    tables = analyze_result.get("tables") or []
    pages = analyze_result.get("pages") or []

    md: list[str] = []
    md.append(f"# Sample diagnostic: `{sample_id}`")
    md.append("")
    md.append("## Unmatched expected-0 fields in this sample")
    md.append("")
    for det in missing_fields_details:
        md.append(
            f"- `{det.get('field')}` — predicted=`{det.get('predicted')!r}`, expected=`{det.get('expected')!r}`, confidence=`{det.get('confidence')}`"
        )
    md.append("")

    # Note: we intentionally do NOT dump first-cell text for other tables on
    # the page (signature/telephone/etc. tables often contain PII such as
    # signatures and names). Only the count + shape is safe to show.
    md.append("## All tables detected by Azure DI (shape only — no cell text)")
    md.append("")
    md.append("| table # | rowCount | columnCount |")
    md.append("| --- | --- | --- |")
    for ti, t in enumerate(tables):
        md.append(f"| {ti} | {t.get('rowCount')} | {t.get('columnCount')} |")
    md.append("")

    stats = {
        "configuredTablesFound": 0,
        "configuredTablesMissing": 0,
        "perFieldVerdicts": Counter(),
    }

    # Map field key → detail for quick lookup
    detail_by_field = {d.get("field"): d for d in missing_fields_details}

    for ci_cfg, cfg in enumerate(table_configs):
        located = find_table(tables, cfg["find"])
        if located is None:
            stats["configuredTablesMissing"] += 1
            md.append(f"## Configured table #{ci_cfg}: NOT FOUND")
            md.append("")
            md.append(f"- Configured `find`: `{json.dumps(cfg.get('find'))}`")
            md.append(
                "- No Azure DI table matched. This is the likely root cause for every missing zero whose field maps into this table."
            )
            md.append("")

            # Template-anchor fingerprint for candidate tables. Designed to
            # let a reviewer confirm whether a fallback finder anchored on
            # header text ("Applicant"/"Spouse") and row labels
            # ("Net Employment Income" etc.) would reliably identify the
            # income table when the section title is OCR-garbled.
            #
            # SAFETY: only template-text cells are shown — row 0 (title), row
            # 1 (column headers), and column 0 (row labels). All other cells
            # (rows ≥2 × columns ≥1) contain user-entered dollar amounts and
            # are intentionally excluded.
            candidates = [
                (i, t)
                for i, t in enumerate(tables)
                if isinstance(t.get("rowCount"), int)
                and isinstance(t.get("columnCount"), int)
                and 5 <= t["rowCount"] <= 25
                and 2 <= t["columnCount"] <= 3
            ]
            if not candidates:
                md.append("### Candidate table fingerprints (no tables of shape rowCount 5-25 × cols 2-3 in this sample)")
                md.append("")
            else:
                md.append("### Candidate table fingerprints (template text only — no user data)")
                md.append("")
                md.append(
                    "For each candidate table, the title row, column-header row, and row-label column are shown."
                )
                md.append(
                    "Value cells (rows ≥2 × columns ≥1) are omitted — they contain user-entered dollar amounts."
                )
                md.append("")
                for ti, t in candidates:
                    rc = t.get("rowCount")
                    cc = t.get("columnCount")
                    cells_by_pos: dict[tuple[int, int], dict] = {}
                    for c in t.get("cells") or []:
                        r = c.get("rowIndex")
                        co = c.get("columnIndex")
                        if isinstance(r, int) and isinstance(co, int):
                            cells_by_pos[(r, co)] = c
                    md.append(f"#### Azure table #{ti} — shape {rc} × {cc}")
                    md.append("")
                    md.append("- Row 0 (title row):")
                    for co in range(cc):
                        c = cells_by_pos.get((0, co))
                        md.append(f"  - col {co}: `{md_escape_cell((c or {}).get('content', '') or '')}`")
                    if rc >= 2:
                        md.append("- Row 1 (column-header row, expected `\"\"`, `\"Applicant\"`, `\"Spouse\"`):")
                        for co in range(cc):
                            c = cells_by_pos.get((1, co))
                            md.append(f"  - col {co}: `{md_escape_cell((c or {}).get('content', '') or '')}`")
                    md.append("- Column 0 across all rows (row labels — printed template):")
                    for r in range(rc):
                        c = cells_by_pos.get((r, 0))
                        md.append(f"  - row {r}: `{md_escape_cell((c or {}).get('content', '') or '')}`")
                    md.append("")

                # --- Group-B positional-mapping fingerprint --------------------
                # When the best candidate has very few row-label matches in
                # column 0, the row-label column is missing from the table.
                # Recovery requires pairing each table row to a row-label
                # *paragraph* by Y-coordinate, and each table column to a
                # header paragraph ("Applicant"/"Spouse") by X-coordinate.
                # This block dumps only the geometric data needed for that
                # design — never arbitrary paragraph text, never user names.
                expected_row_labels = [
                    r.get("labelEquals") or r.get("labelContains") or ""
                    for r in cfg["rows"]
                ]
                expected_row_labels = [s for s in expected_row_labels if s]
                expected_column_headers = [
                    c.get("headerEquals") or c.get("headerContains") or ""
                    for c in cfg["columns"]
                ]
                expected_column_headers = [s for s in expected_column_headers if s]

                def best_label_score(table_obj: dict) -> int:
                    cells_seen = [
                        (c.get("content") or "")
                        for c in (table_obj.get("cells") or [])
                        if c.get("columnIndex") == 0
                    ]
                    score = 0
                    for lab in expected_row_labels:
                        if any(lab.lower() in (cs or "").lower() for cs in cells_seen):
                            score += 1
                    return score

                group_b_candidates = [
                    (ti, t)
                    for ti, t in candidates
                    if best_label_score(t) < 12
                ]
                if group_b_candidates:
                    md.append("### Positional-mapping fingerprint (Group-B candidates: no row labels in col 0)")
                    md.append("")
                    md.append("For each candidate, emits geometric data needed to pair table rows to")
                    md.append("row-label paragraphs by Y-coordinate, and table columns to header")
                    md.append("paragraphs (`Applicant`/`Spouse`) by X-coordinate. Only template-text")
                    md.append("paragraph matches are dumped; arbitrary paragraphs (which may contain")
                    md.append("user data) are not.")
                    md.append("")
                    for ti, t in group_b_candidates:
                        rc = t.get("rowCount")
                        cc = t.get("columnCount")
                        cells_by_pos: dict[tuple[int, int], dict] = {}
                        for c in t.get("cells") or []:
                            r = c.get("rowIndex")
                            co = c.get("columnIndex")
                            if isinstance(r, int) and isinstance(co, int):
                                cells_by_pos[(r, co)] = c
                        # Determine the page this table lives on (use any cell's region)
                        any_cell = next((c for c in (t.get("cells") or []) if c.get("boundingRegions")), None)
                        page_no = None
                        if any_cell:
                            regs = any_cell.get("boundingRegions") or []
                            if regs:
                                page_no = regs[0].get("pageNumber")
                        md.append(f"#### Azure table #{ti} — shape {rc} × {cc} (page {page_no})")
                        md.append("")

                        # Row Y-ranges from column 0 cells (or any column if 0 absent)
                        md.append("- Row Y-ranges (computed from cell bboxes in col 0):")
                        for r in range(rc):
                            c = cells_by_pos.get((r, 0))
                            if not c:
                                md.append(f"  - row {r}: (cell missing)")
                                continue
                            regs = c.get("boundingRegions") or []
                            if not regs:
                                md.append(f"  - row {r}: (no boundingRegions)")
                                continue
                            poly = regs[0].get("polygon")
                            box = polygon_bbox(poly)
                            if box is None:
                                md.append(f"  - row {r}: (bad polygon)")
                                continue
                            md.append(f"  - row {r}: y=({box[1]:.3f}, {box[3]:.3f}) midY={(box[1]+box[3])/2:.3f}")
                        md.append("")

                        # Column X-ranges from row 0 cells (or any row if 0 absent)
                        md.append("- Column X-ranges (computed from cell bboxes in row 0):")
                        for co in range(cc):
                            c = cells_by_pos.get((0, co))
                            if not c:
                                md.append(f"  - col {co}: (cell missing)")
                                continue
                            regs = c.get("boundingRegions") or []
                            if not regs:
                                md.append(f"  - col {co}: (no boundingRegions)")
                                continue
                            poly = regs[0].get("polygon")
                            box = polygon_bbox(poly)
                            if box is None:
                                md.append(f"  - col {co}: (bad polygon)")
                                continue
                            md.append(f"  - col {co}: x=({box[0]:.3f}, {box[2]:.3f}) midX={(box[0]+box[2])/2:.3f}")
                        md.append("")

                        # Cells of this table, showing only the rows × columns we'd target
                        # (all rows, all columns of the candidate). Cell content is
                        # value-cell content but already seen in earlier dumps for found
                        # tables — keeping it lets reviewers spot eligibility patterns.
                        md.append("- Cells (raw content, for eligibility verification):")
                        md.append("")
                        md.append(render_table_markdown(t, set()))
                        md.append("")

                        # Selection-mark overlap counts per cell — gate input for the
                        # existing eligibility rule. No content shown here; just counts.
                        md.append("- Selection-mark overlap counts per cell:")
                        md.append("")
                        header = ["row \\ col"] + [str(ci) for ci in range(cc)]
                        sep = ["---"] * len(header)
                        lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(sep) + " |"]
                        for r in range(rc):
                            row_cells = [str(r)]
                            for co in range(cc):
                                cc_cell = cells_by_pos.get((r, co))
                                if not cc_cell:
                                    row_cells.append("-")
                                    continue
                                m = marks_overlapping_cell(cc_cell, pages)
                                row_cells.append(str(len(m)))
                            lines.append("| " + " | ".join(row_cells) + " |")
                        md.append("\n".join(lines))
                        md.append("")

                        # Row-label paragraph hits on the same page (template text only)
                        same_page_paras = []
                        for p in (analyze_result.get("paragraphs") or []):
                            regs = p.get("boundingRegions") or []
                            if not regs:
                                continue
                            if page_no is not None and regs[0].get("pageNumber") != page_no:
                                continue
                            pbox = polygon_bbox(regs[0].get("polygon"))
                            if pbox is None:
                                continue
                            same_page_paras.append({"text": (p.get("content") or ""), "box": pbox})

                        # IMPORTANT — paragraph match outputs ONLY counts and
                        # midY/midX. We never dump matched paragraph text, so
                        # even loose substring matches against template label
                        # names cannot leak user data (signatures, names,
                        # dollar amounts) into the dump.
                        #
                        # We report three match modes per label so reviewers
                        # can compare:
                        #   - exact: case-/whitespace-normalized equality
                        #   - fuzzy: edit-ratio >= 0.88 AND length-similar
                        #   - loose: substring contains (this is what the
                        #     production algorithm would use; the diagnostic
                        #     only needs the Y-midpoint, not the matched text)
                        import difflib

                        def _norm(s: str) -> str:
                            return (s or "").replace("\r", "").replace("\n", " ").strip().lower()

                        def _match_exact(lab: str, para_text: str) -> bool:
                            return _norm(lab) == _norm(para_text)

                        def _match_fuzzy(lab: str, para_text: str) -> bool:
                            a, b = _norm(lab), _norm(para_text)
                            if not a or not b:
                                return False
                            length_tol = max(3, int(0.20 * max(len(a), 1)))
                            if abs(len(a) - len(b)) > length_tol:
                                return False
                            ratio = difflib.SequenceMatcher(None, a, b).ratio()
                            return ratio >= 0.88

                        def _match_loose(lab: str, para_text: str) -> bool:
                            a, b = _norm(lab), _norm(para_text)
                            if not a or not b:
                                return False
                            return a in b

                        def hits_for(lab: str, match_fn) -> list[dict]:
                            return [pp for pp in same_page_paras if match_fn(lab, pp["text"])]

                        md.append("- Row-label paragraphs on page (counts + midY only — no paragraph text dumped):")
                        md.append("")
                        md.append("| expected label | exact | fuzzy | loose | midY (loose-first) | midX (loose-first) |")
                        md.append("| --- | --- | --- | --- | --- | --- |")
                        # Track per-mode hit Ys for the offset-vote tally below
                        per_mode_label_y: dict[str, dict[str, float]] = {"exact": {}, "fuzzy": {}, "loose": {}}
                        for lab in expected_row_labels:
                            e = hits_for(lab, _match_exact)
                            f = hits_for(lab, _match_fuzzy)
                            l = hits_for(lab, _match_loose)
                            if e: per_mode_label_y["exact"][lab] = (e[0]["box"][1] + e[0]["box"][3]) / 2
                            if f: per_mode_label_y["fuzzy"][lab] = (f[0]["box"][1] + f[0]["box"][3]) / 2
                            if l: per_mode_label_y["loose"][lab] = (l[0]["box"][1] + l[0]["box"][3]) / 2
                            if l:
                                bx = l[0]["box"]
                                midY = (bx[1] + bx[3]) / 2
                                midX = (bx[0] + bx[2]) / 2
                                md.append(f"| `{md_escape_cell(lab)}` | {len(e)} | {len(f)} | {len(l)} | {midY:.3f} | {midX:.3f} |")
                            else:
                                md.append(f"| `{md_escape_cell(lab)}` | {len(e)} | {len(f)} | {len(l)} | — | — |")
                        md.append("")
                        md.append(
                            f"  per-mode label-match totals: exact={len(per_mode_label_y['exact'])}/18  fuzzy={len(per_mode_label_y['fuzzy'])}/18  loose={len(per_mode_label_y['loose'])}/18"
                        )
                        md.append("")

                        # Header paragraph hits ("Applicant"/"Spouse") — exact only.
                        # We don't relax this to loose because for column mapping
                        # we won't actually use page paragraphs (we'll use the
                        # candidate table's column ordering instead). This stays
                        # here purely for diagnostic completeness.
                        md.append("- Header paragraphs on page (exact-text match — informational only; algorithm uses candidate-table column order):")
                        md.append("")
                        md.append("| expected header | matches | midY (each) | midX (each) |")
                        md.append("| --- | --- | --- | --- |")
                        for hdr in expected_column_headers:
                            hits = [pp for pp in same_page_paras if _norm(pp["text"]) == _norm(hdr)]
                            if not hits:
                                md.append(f"| `{md_escape_cell(hdr)}` | 0 | — | — |")
                                continue
                            yxs = []
                            for hh in hits:
                                bx = hh["box"]
                                yxs.append(f"y={ (bx[1]+bx[3])/2 :.3f} x={ (bx[0]+bx[2])/2 :.3f}")
                            md.append(f"| `{md_escape_cell(hdr)}` | {len(hits)} | {'; '.join(yxs)} | |")
                        md.append("")

                        # ------------------------------------------------------
                        # Offset-vote tally for row indexing
                        # ------------------------------------------------------
                        # The production algorithm needs to know how to map
                        # candidate-table rows → schema field indexes. Each
                        # matched label provides one anchor: the label's
                        # field_index (its position in the configured rows[]
                        # list, 0-based) paired with the table row whose midY
                        # is closest to that label's midY. The implied row→
                        # field offset is `label_index - row_index`.
                        #
                        # If most anchors agree on the same offset, the
                        # algorithm applies it uniformly. If anchors split or
                        # only 1-2 agree, the algorithm should skip the
                        # sample. This tally surfaces the agreement up-front.
                        md.append("- Row-offset vote tally (label_index − row_index, per match mode):")
                        md.append("")
                        # Pre-compute row midYs from col-0 cell bboxes
                        row_midYs: dict[int, float] = {}
                        for r in range(rc):
                            cc_cell = cells_by_pos.get((r, 0))
                            if not cc_cell: continue
                            regs = cc_cell.get("boundingRegions") or []
                            if not regs: continue
                            box = polygon_bbox(regs[0].get("polygon"))
                            if box is None: continue
                            row_midYs[r] = (box[1] + box[3]) / 2

                        # Build label_index lookup (config order)
                        lab_to_index = {lab: i for i, lab in enumerate(expected_row_labels)}

                        md.append("| mode | matched labels | distinct offsets | top offset | top votes | 2nd offset | 2nd votes |")
                        md.append("| --- | --- | --- | --- | --- | --- | --- |")
                        for mode_name in ("exact", "fuzzy", "loose"):
                            anchors_per_mode: list[tuple[str, float]] = list(per_mode_label_y[mode_name].items())
                            offset_votes: Counter = Counter()
                            for lab, lab_y in anchors_per_mode:
                                if not row_midYs:
                                    continue
                                # Find the nearest row by midY
                                nearest_row = min(row_midYs.items(), key=lambda kv: abs(kv[1] - lab_y))[0]
                                # Only count an anchor if Y is tight (within half row height ≈ 0.10in)
                                if abs(row_midYs[nearest_row] - lab_y) > 0.20:
                                    continue
                                lab_idx = lab_to_index.get(lab)
                                if lab_idx is None:
                                    continue
                                offset_votes[lab_idx - nearest_row] += 1
                            sorted_votes = offset_votes.most_common()
                            if not sorted_votes:
                                md.append(f"| {mode_name} | {len(anchors_per_mode)} | 0 | — | 0 | — | — |")
                                continue
                            top_o, top_v = sorted_votes[0]
                            sec_o, sec_v = (sorted_votes[1] if len(sorted_votes) > 1 else ("—", 0))
                            md.append(f"| {mode_name} | {len(anchors_per_mode)} | {len(sorted_votes)} | {top_o:+d} | {top_v} | {sec_o if sec_o == '—' else f'{sec_o:+d}'} | {sec_v} |")
                        md.append("")
                        md.append(
                            "  Interpretation: a sample is safely recoverable when one offset dominates (e.g. top_votes >= 3 and >= 2× the 2nd)."
                        )
                        md.append("")
            for row in cfg["rows"]:
                for col in cfg["columns"]:
                    fk = f"{col['prefix']}{row['suffix']}"
                    if fk in detail_by_field:
                        stats["perFieldVerdicts"]["SKIP: table not found"] += 1
            continue

        stats["configuredTablesFound"] += 1
        table, table_index = located
        column_map = resolve_column_indexes(table, cfg["columns"])
        row_map = resolve_row_indexes(table, cfg["rows"])
        strip_tokens = (cfg.get("cellEligibility") or {}).get("stripBeforeCheck") or DEFAULT_STRIP_TOKENS
        require_mark = (cfg.get("cellEligibility") or {}).get("requireSelectionMarkInCell", True)
        recovery_value = cfg.get("recoveryValue", 0)

        # Compute targeted cells for the table render
        targeted_cells: set[tuple[int, int]] = set()
        per_field_verdicts: list[dict] = []

        for row in cfg["rows"]:
            ri = row_map.get(row["suffix"])
            for col in cfg["columns"]:
                ci = column_map.get(col["prefix"])
                fk = f"{col['prefix']}{row['suffix']}"
                if fk not in detail_by_field:
                    continue
                if ri is None or ci is None:
                    per_field_verdicts.append({
                        "fieldKey": fk,
                        "verdict": "SKIP",
                        "reason": "unresolved-selector",
                        "details": f"row.suffix={row['suffix']!r} resolved to {ri!r}; col.prefix={col['prefix']!r} resolved to {ci!r}",
                    })
                    stats["perFieldVerdicts"]["SKIP: unresolved-selector"] += 1
                    continue
                targeted_cells.add((ri, ci))

                cell = get_cell(table, ri, ci)
                detail = detail_by_field[fk]

                if cell is None:
                    per_field_verdicts.append({
                        "fieldKey": fk,
                        "verdict": "SKIP",
                        "reason": "cell-not-found",
                        "rowIndex": ri,
                        "columnIndex": ci,
                    })
                    stats["perFieldVerdicts"]["SKIP: cell-not-found"] += 1
                    continue

                cell_content = cell.get("content", "") or ""
                stripped = cell_strip(cell_content, strip_tokens)
                content_ok = cell_is_eligible_by_content(cell_content, strip_tokens)
                marks = marks_overlapping_cell(cell, pages)
                marks_ok = (not require_mark) or (len(marks) > 0)
                exp_num = parse_expected_number(detail.get("expected"))
                expected_ok = exp_num is not None and float(exp_num) == float(recovery_value)

                region = (cell.get("boundingRegions") or [{}])[0]
                bbox = polygon_bbox(region.get("polygon"))
                bbox_str = (
                    f"({bbox[0]:.2f},{bbox[1]:.2f})–({bbox[2]:.2f},{bbox[3]:.2f}) p{region.get('pageNumber')}"
                    if bbox
                    else "(none)"
                )

                if content_ok and marks_ok and expected_ok:
                    verdict = "FLIP"
                    reason = "eligible — would have been recovered (algorithm appears to be working but the JSON we read says matched=false)"
                    stats["perFieldVerdicts"]["FLIP-eligible (unexpected for missing list)"] += 1
                else:
                    verdict = "SKIP"
                    fails = []
                    if not content_ok:
                        fails.append(
                            f"content-test failed: stripped={stripped!r} contains digit/letter"
                        )
                    if not marks_ok:
                        fails.append("no selection mark inside cell bbox")
                    if not expected_ok:
                        fails.append(f"expected={detail.get('expected')!r} does not parse to {recovery_value}")
                    reason = "; ".join(fails)
                    stats["perFieldVerdicts"]["SKIP: " + (fails[0].split(":", 1)[0] if fails else "unknown")] += 1

                per_field_verdicts.append({
                    "fieldKey": fk,
                    "verdict": verdict,
                    "reason": reason,
                    "rowIndex": ri,
                    "columnIndex": ci,
                    "cellContent": cell_content,
                    "stripped": stripped,
                    "selectionMarksInCell": marks,
                    "bbox": bbox_str,
                    "expected": detail.get("expected"),
                    "predicted": detail.get("predicted"),
                    "confidence": detail.get("confidence"),
                })

        # Render this configured table
        md.append(f"## Configured table #{ci_cfg} → Azure table {table_index}")
        md.append("")
        md.append(f"- `find`: `{json.dumps(cfg.get('find'))}`")
        md.append(
            f"- Column header → prefix resolved: `{ {k: v for k, v in column_map.items()} }`"
        )
        md.append(
            f"- Row label → row index resolved: `{len(row_map)}/{len(cfg['rows'])}` rows matched"
        )
        unresolved_rows = [r["suffix"] for r in cfg["rows"] if r["suffix"] not in row_map]
        if unresolved_rows:
            md.append(f"- ⚠ unresolved row suffixes: `{unresolved_rows}`")
        unresolved_cols = [c["prefix"] for c in cfg["columns"] if c["prefix"] not in column_map]
        if unresolved_cols:
            md.append(f"- ⚠ unresolved column prefixes: `{unresolved_cols}`")
        md.append("")
        md.append("### Table grid (⚠ marks cells targeted by unmatched fields)")
        md.append("")
        md.append(render_table_markdown(table, targeted_cells))
        md.append("")

        md.append("### Per-field verdicts")
        md.append("")
        for v in per_field_verdicts:
            md.append(f"#### `{v['fieldKey']}` — {v['verdict']}")
            md.append("")
            md.append(f"- reason: {v.get('reason')}")
            if "rowIndex" in v:
                md.append(f"- table cell: row={v['rowIndex']} col={v['columnIndex']}")
            if "bbox" in v:
                md.append(f"- bbox: {v['bbox']}")
            if "cellContent" in v:
                md.append(f"- cell content (raw): `{md_escape_cell(v['cellContent'])}`")
                md.append(f"- cell content after strip: `{md_escape_cell(v['stripped'])}`")
            if "selectionMarksInCell" in v:
                marks = v["selectionMarksInCell"]
                if marks:
                    md.append(f"- selection marks overlapping cell: {len(marks)}")
                    for m in marks:
                        md.append(
                            f"  - state=`{m.get('state')}` confidence=`{m.get('confidence')}`"
                        )
                else:
                    md.append("- selection marks overlapping cell: 0")
            md.append(
                f"- benchmark says: expected=`{v.get('expected')!r}` predicted=`{v.get('predicted')!r}` confidence=`{v.get('confidence')}`"
            )
            md.append("")
    return "\n".join(md), stats


# ---------------------------------------------------------------------------
# Stream loader (same format as recover-numeric-zeros.py)
# ---------------------------------------------------------------------------


def load_ocr_cache_from_stream(stream: Iterable[bytes]) -> dict[str, dict]:
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
        try:
            sid = base64.b64decode(line[:sp]).decode("utf-8", errors="replace")
            payload = json.loads(base64.b64decode(line[sp + 1 :]).decode("utf-8"))
        except Exception:
            rejected += 1
            continue
        cache[sid] = payload
    sys.stderr.write(f"ocr-cache stream: loaded={len(cache)} rejected={rejected}\n")
    return cache


# ---------------------------------------------------------------------------
# Filename helpers (mirror PowerShell sanitization in the export script)
# ---------------------------------------------------------------------------

_WIN_FORBIDDEN = re.compile(r"[<>:\"/\\|?*]")


def sanitize_for_filename(value: str) -> str:
    safe = _WIN_FORBIDDEN.sub("_", value).strip()
    if not safe:
        safe = "_"
    if len(safe) > 200:
        safe = safe[:200]
    return safe


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("benchmark", help="benchmark JSON path (may be /dev/fd/N)")
    ap.add_argument("--out-dir", help="directory to write per-sample .md files into (one .md per affected sample + INDEX.md)")
    ap.add_argument("--out-file", help="single combined markdown file to write all per-sample dumps into (mutually exclusive with --out-dir)")
    ap.add_argument(
        "--ocr-cache-stream",
        default="-",
        help="path to OCR-cache stream (default: stdin)",
    )
    ap.add_argument(
        "--strip-sample-id-suffix",
        default="",
        help="optional suffix (e.g. '.jpg') to strip from OCR-cache sample IDs",
    )
    ap.add_argument(
        "--table-config-json",
        default=None,
        help="optional path to a JSON file overriding the built-in SDPR table config",
    )
    ap.add_argument(
        "--include-only-fields-regex",
        default=None,
        help="optional regex; only fields matching this are dumped (default: every (expected=0, matched=false) detail)",
    )
    args = ap.parse_args(argv)

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

    raw = json.loads(Path(args.benchmark).read_text("utf-8"))
    samples = raw.get("perSampleResults") or []

    if args.table_config_json:
        table_configs = json.loads(Path(args.table_config_json).read_text("utf-8"))
    else:
        table_configs = SDPR_TABLE_CONFIG

    field_filter = re.compile(args.include_only_fields_regex) if args.include_only_fields_regex else None

    if bool(args.out_dir) == bool(args.out_file):
        sys.stderr.write("error: exactly one of --out-dir or --out-file is required\n")
        return 2

    out_dir = Path(args.out_dir) if args.out_dir else None
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)

    combined_chunks: list[str] = []  # used when --out-file is set

    total_samples_affected = 0
    total_missing_zeros = 0
    samples_missing_cache: list[str] = []
    verdict_totals: Counter = Counter()

    for sample in samples:
        sid = sample.get("sampleId", "?")
        details = sample.get("evaluationDetails") or []
        missing = []
        for det in details:
            if det.get("matched") is True:
                continue
            field = det.get("field")
            if field_filter and not field_filter.search(field or ""):
                continue
            exp_num = parse_expected_number(det.get("expected"))
            if exp_num is None or exp_num != 0.0:
                continue
            # Only "missing" predictions — None or empty string. Cases where
            # Azure extracted a non-empty value (even if wrong, like '0:00' or
            # '7') are wrong-extractions, not missing 0s, and are out of
            # scope for this recovery review.
            predicted = det.get("predicted")
            is_missing = predicted is None or (isinstance(predicted, str) and predicted.strip() == "")
            if not is_missing:
                continue
            missing.append(det)
        if not missing:
            continue
        total_samples_affected += 1
        total_missing_zeros += len(missing)

        # Look up OCR cache (suffix-tolerant)
        cache_entry = ocr_cache.get(sid)
        if cache_entry is None:
            for sfx in (".jpg", ".jpeg", ".png", ".pdf", ".tif", ".tiff"):
                if sid.endswith(sfx) and sid[: -len(sfx)] in ocr_cache:
                    cache_entry = ocr_cache[sid[: -len(sfx)]]
                    break
                if sid + sfx in ocr_cache:
                    cache_entry = ocr_cache[sid + sfx]
                    break

        if cache_entry is None:
            samples_missing_cache.append(sid)
            stub_lines = [
                f"# Sample diagnostic: `{sid}`",
                "",
                "## OCR cache MISSING",
                "",
                f"- No OCR cache file found for sample id `{sid}`.",
                "- Unmatched expected-0 fields:",
            ]
            for d in missing:
                stub_lines.append(
                    f"  - `{d.get('field')}` predicted=`{d.get('predicted')!r}` expected=`{d.get('expected')!r}`"
                )
            stub_text = "\n".join(stub_lines) + "\n"
            verdict_totals["NO_CACHE"] += len(missing)
            if out_dir is not None:
                (out_dir / f"{sanitize_for_filename(sid)}.md").write_text(stub_text, "utf-8")
            else:
                combined_chunks.append(stub_text)
            continue

        analyze_result = (cache_entry.get("analyzeResult") or {})
        md_text, stats = render_sample_markdown(sid, missing, analyze_result, table_configs)
        for k, v in stats["perFieldVerdicts"].items():
            verdict_totals[k] += v
        if out_dir is not None:
            (out_dir / f"{sanitize_for_filename(sid)}.md").write_text(md_text + "\n", "utf-8")
        else:
            combined_chunks.append(md_text + "\n")

    # Summary block (used as INDEX.md for --out-dir, or as the header for --out-file)
    summary_lines = [
        "# Missing-zero diagnostics",
        "",
        f"- Samples with at least one (expected=0, matched=false): **{total_samples_affected}**",
        f"- Total missing zeros across those samples: **{total_missing_zeros}**",
        f"- Samples with no OCR cache found: **{len(samples_missing_cache)}**",
        "- Per-field verdicts across all samples:",
    ]
    for k, v in sorted(verdict_totals.items()):
        summary_lines.append(f"  - `{k}`: {v}")

    if out_dir is not None:
        summary_lines += [
            "",
            "Each `<sampleId>.md` file in this folder dumps the income table grid and",
            "per-field algorithm verdict for one sample. Open any of them and look at",
            "`Per-field verdicts` to see exactly why a cell did not flip.",
        ]
        (out_dir / "INDEX.md").write_text("\n".join(summary_lines) + "\n", "utf-8")
        file_count = sum(1 for _ in out_dir.glob("*.md") if _.name != "INDEX.md")
        sys.stderr.write(
            f"samples affected: {total_samples_affected} | missing zeros total: {total_missing_zeros} | samples without OCR cache: {len(samples_missing_cache)} | files written: {file_count + 1}\n"
        )
    else:
        summary_lines += [
            "",
            "Each per-sample section below dumps the income table grid and per-field",
            "algorithm verdict so reviewers can see why each cell did not flip.",
            "",
            "---",
        ]
        out_path = Path(args.out_file)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        body = "\n\n---\n\n".join(combined_chunks)
        out_path.write_text("\n".join(summary_lines) + "\n\n" + body + "\n", "utf-8")
        sys.stderr.write(
            f"samples affected: {total_samples_affected} | missing zeros total: {total_missing_zeros} | samples without OCR cache: {len(samples_missing_cache)} | combined file bytes: {out_path.stat().st_size}\n"
        )
    sys.stderr.write(f"verdict breakdown: {dict(verdict_totals)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
