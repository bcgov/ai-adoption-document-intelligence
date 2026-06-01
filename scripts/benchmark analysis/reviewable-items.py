#!/usr/bin/env python3
"""Emit a CSV of every prediction that would be shown to a reviewer under the
SDPR HITL field-scope policy. One row per (sampleId, field). Used to seed the
HITL timing experiment.

Filter policy (matches hitl-planner --categories income_amounts,sin,phone,name,date
                                    --skip-trivial-predictions-in-categories income_amounts):

  - keep only categories in {sin, phone, name, date, income_amounts}
  - drop predictions where BOTH the prediction and ground truth are empty
    (nothing for the reviewer to look at on the form)
  - for income_amounts only, additionally drop predictions that are a single
    character or blank — those are operationally "no income for this category"
    and don't need verification

No confidence-threshold filter is applied here — every reviewable prediction
in the in-scope categories appears, so the experiment can be re-sliced by
threshold afterwards.

Usage:
    python reviewable-items.py <benchmark.json> <out.csv>
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any

CATEGORIES = {"sin", "phone", "name", "date", "income_amounts"}
SKIP_TRIVIAL_CATEGORIES = {"income_amounts"}


def classify(field: str) -> str:
    if field in ("sin", "spouse_sin"): return "sin"
    if field in ("date", "spouse_date"): return "date"
    if field in ("phone", "spouse_phone"): return "phone"
    if field in ("name", "spouse_name"): return "name"
    if field in ("signature", "spouse_signature"): return "signature"
    if field == "explain_changes": return "freeform_text"
    if field == "case_id": return "case_id"
    if field.startswith("checkbox_"): return "checkboxes"
    return "income_amounts"


def is_empty(v: Any) -> bool:
    if v is None: return True
    if isinstance(v, str): return v.strip() == ""
    if isinstance(v, (list, dict)): return len(v) == 0
    return False


def is_trivial(v: Any) -> bool:
    """Same rule as hitl-planner._predicted_looks_trivial — prediction-only
    (no GT access required)."""
    if v is None: return True
    if isinstance(v, bool): return False
    if isinstance(v, (int, float)):
        try: return -10 < v < 10 and float(v) == int(v)
        except (ValueError, OverflowError): return False
    if isinstance(v, str): return len(v.strip()) <= 1
    return False


def error_kind(matched: bool, predicted: Any, expected: Any) -> str:
    if matched: return "matched"
    pe = is_empty(predicted)
    ee = is_empty(expected)
    if not ee and pe: return "missing"
    if ee and not pe: return "extra"
    return "wrong"


def serialize(v: Any) -> str:
    if v is None: return ""
    if isinstance(v, (dict, list)): return json.dumps(v, ensure_ascii=False)
    return str(v)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: reviewable-items.py <benchmark.json> <out.csv>", file=sys.stderr)
        return 2
    in_path = Path(argv[0])
    out_path = Path(argv[1])

    raw = json.loads(in_path.read_text("utf-8"))
    rows = []
    for sample in raw.get("perSampleResults") or []:
        sid = sample.get("sampleId", "?")
        for det in sample.get("evaluationDetails") or []:
            field = det.get("field")
            if not isinstance(field, str):
                continue
            cat = classify(field)
            if cat not in CATEGORIES:
                continue
            predicted = det.get("predicted") if "predicted" in det else None
            expected = det.get("expected") if "expected" in det else None
            matched = det.get("matched") is True
            confidence = det.get("confidence")

            pe = is_empty(predicted)
            ee = is_empty(expected)
            # reviewable: at least one side has content
            if pe and ee:
                continue
            # income-only: drop trivial predictions (single char or blank)
            if cat in SKIP_TRIVIAL_CATEGORIES and (pe or is_trivial(predicted)):
                continue

            rows.append({
                "sampleId": sid,
                "category": cat,
                "field": field,
                "kind": error_kind(matched, predicted, expected),
                "predicted": serialize(predicted),
                "expected": serialize(expected),
                "confidence": confidence if confidence is not None else "",
            })

    # Stable sort: category → field → sampleId
    cat_order = ["sin", "date", "phone", "name", "income_amounts"]
    cat_rank = {c: i for i, c in enumerate(cat_order)}
    rows.sort(key=lambda r: (cat_rank.get(r["category"], 99), r["field"], r["sampleId"]))

    header = ["sampleId", "category", "field", "kind", "predicted", "expected", "confidence"]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow([r[c] for c in header])

    # Summary (no PII — only counts)
    by_cat: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for r in rows:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + 1
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
    print(f"wrote {out_path}: {len(rows)} reviewable items", file=sys.stderr)
    print(f"  by category: {by_cat}", file=sys.stderr)
    print(f"  by kind:     {by_kind}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
