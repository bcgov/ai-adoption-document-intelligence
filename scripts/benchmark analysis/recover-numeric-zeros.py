#!/usr/bin/env python3
"""
Recover numeric zeros in a benchmark JSON that the custom Azure DI model
missed because the prebuilt-layout step parsed a `0` as a selection mark.

This is the standalone counterpart to the temporal activity
`ocr.recoverNumericZerosFromCheckboxes` — same algorithm, applied to an
already-evaluated benchmark export instead of mutating the OCR result mid-
pipeline. For every per-sample evaluationDetail whose `field` is configured
on an income-style row/column and whose `expected` equals the configured
recovery value, we look up the matching table cell in the OCR cache for
that sample and, when it shows a selection-mark glyph instead of any digit
or letter, flip `matched: true` and stamp `matchedVia: "recovered:checkbox-zero"`.

Eligibility (per cell, identical to the activity):
  1. Cell content has no digits and no letters after stripping configured
     tokens (default: `$`, `€`, `£`, `¥`, `:selected:`, `:unselected:`).
  2. At least one `pages[].selectionMarks[*]` polygon overlaps the cell's
     bounding region.
  3. The benchmark detail is currently unmatched and its `expected`
     parses to the configured recovery value.

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
                  recovery — useful when reviewing what was flipped.
                  Column order matches normalize-benchmark.py so the two
                  audits can be merged into a single changes.csv.)
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
    },
]

DEFAULT_STRIP_TOKENS = ["$", "€", "£", "¥", ":selected:", ":unselected:"]

# ---------------------------------------------------------------------------
# Text + geometry helpers (mirror ocr-recover-numeric-zeros.ts)
# ---------------------------------------------------------------------------


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    s = str(value)
    return re.sub(r"\s+", " ", s).strip()


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


def bbox_overlaps(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def cell_is_eligible_by_content(content: str, strip_tokens: list[str]) -> bool:
    stripped = content
    for tok in strip_tokens:
        if not tok:
            continue
        stripped = re.sub(re.escape(tok), "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s+", "", stripped)
    if not stripped:
        return True
    return re.search(r"[A-Za-z0-9]", stripped) is None


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
# Per-sample recovery
# ---------------------------------------------------------------------------


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

        located = find_table(tables, cfg["find"])
        if located is None:
            continue
        table, table_index = located

        column_map = resolve_column_indexes(table, cfg["columns"])
        row_map = resolve_row_indexes(table, cfg["rows"])

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
                # Idempotency: if this detail was already flipped by a
                # prior run of this script, re-emit the audit row but skip
                # mutation. That way re-runs produce a complete changes.csv
                # without depending on having the original benchmark JSON.
                already_recovered = (
                    detail.get("matched") is True
                    and detail.get("matchedVia") == "recovered:checkbox-zero"
                )
                if detail.get("matched") is True and not already_recovered:
                    continue
                # Only recover when the expected value matches our configured
                # recovery value — protects against flipping unrelated mismatches.
                exp_num = parse_expected_number(detail.get("expected"))
                if exp_num is None or float(exp_num) != float(recovery_value):
                    continue
                cell = get_cell(table, ri, ci)
                if cell is None:
                    continue
                if not cell_is_eligible_by_content(cell.get("content", "") or "", strip_tokens):
                    continue
                if require_mark and not cell_has_selection_mark(cell, pages, accepted_states):
                    continue

                prior_predicted = detail.get("predicted")
                if not already_recovered:
                    detail["matched"] = True
                    detail["matchedVia"] = "recovered:checkbox-zero"
                    detail["recoveredValue"] = recovery_value
                recoveries.append(
                    {
                        "sampleId": sid,
                        "field": field_key,
                        "rule": "recovered:checkbox-zero",
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
# perFieldResults rebuild (compatible with the existing normalize-benchmark
# output so analyze.js consumes both identically). Logic mirrors
# scripts/benchmark analysis/normalize-benchmark.py:recompute_per_field_results.
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
        # Try direct + suffix-tolerant lookup
        cache_entry = ocr_cache.get(sid)
        if cache_entry is None:
            # Try stripping common image suffixes from the benchmark sid
            for sfx in (".jpg", ".jpeg", ".png", ".pdf", ".tif", ".tiff"):
                if sid.endswith(sfx) and sid[: -len(sfx)] in ocr_cache:
                    cache_entry = ocr_cache[sid[: -len(sfx)]]
                    break
        if cache_entry is None:
            # And vice-versa: cached sid had extension, benchmark sid did not
            for sfx in (".jpg", ".jpeg", ".png", ".pdf", ".tif", ".tiff"):
                if sid + sfx in ocr_cache:
                    cache_entry = ocr_cache[sid + sfx]
                    break
        if cache_entry is None:
            missing_ocr_cache_for.append(sid)
            continue
        all_recoveries.extend(recover_for_sample(sample, cache_entry, table_configs))

    # Rebuild perFieldResults from the mutated details so downstream tooling
    # (analyze.js, compare-engines.py) sees consistent counts.
    raw["perFieldResults"] = recompute_per_field_results(samples)

    # Stamp the recovery marker — extend any existing normalization stamp.
    raw.setdefault("numericZeroRecovery", {}).update(
        {
            "appliedBy": "scripts/benchmark analysis/recover-numeric-zeros.py",
            "flippedCount": len(all_recoveries),
            "samplesMissingOcrCache": len(missing_ocr_cache_for),
        }
    )

    # Write outputs
    Path(args.out).write_text(json.dumps(raw, ensure_ascii=False, indent=2), "utf-8")

    # Build the row list for the recovery CSV — column order matches
    # normalize-benchmark.py so the two audits can be merged trivially.
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
        # Read existing rows from the merge source, preserving any non-
        # recovery rule entries verbatim. Drop existing "recovered:" rows
        # so re-running this script doesn't accumulate duplicates.
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
                if isinstance(rule, str) and rule.startswith("recovered:"):
                    continue
                merged_rows.append(row)
                merged_existing_count += 1

    merged_rows.extend(recovery_rows)

    with open(args.changes, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sampleId", "field", "rule", "predicted", "expected"])
        for row in merged_rows:
            w.writerow(row)

    # Stderr-only summary (counts; safe to surface).
    by_field = Counter(r["field"] for r in all_recoveries)
    newly_flipped = sum(1 for r in all_recoveries if not r.get("alreadyRecovered"))
    re_emitted = sum(1 for r in all_recoveries if r.get("alreadyRecovered"))
    sys.stderr.write(
        f"recovery rows: {len(all_recoveries)} (newly flipped: {newly_flipped}, re-emitted from prior run: {re_emitted}) across {len(samples)} samples\n"
    )
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
