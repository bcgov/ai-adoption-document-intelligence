#!/usr/bin/env python3
"""Verify the all-predictions.csv aggregate statistics against the reported
numbers, and emit a per-field reviewable-breakdown CSV.

The script reads all-predictions.csv and computes:
  - Total predictions, by kind (matched/wrong/missing/extra)
  - Per-category counts and accuracy
  - Per-field counts of: total, matched/wrong/missing/extra, predicted-filled,
    expected-filled, either-filled (= reviewable)

It does NOT print actual predicted/expected values — only counts. The
per-field output CSV is also aggregate-only (counts, no values), so it can
be reviewed without leaking PII.

Usage:
    python verify-all-predictions.py <all-predictions.csv> <out-per-field.csv>
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path


CATEGORY_ORDER = [
    "sin", "date", "phone", "name", "signature",
    "freeform_text", "case_id", "checkboxes", "income_amounts",
]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: verify-all-predictions.py <all-predictions.csv> <out-per-field.csv>", file=sys.stderr)
        return 2

    in_path = Path(argv[0])
    out_path = Path(argv[1])

    per_category: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    per_field: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    field_to_category: dict[str, str] = {}
    sample_ids: set[str] = set()
    total = 0
    by_kind: dict[str, int] = defaultdict(int)

    with in_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cat = row["category"]
            fld = row["field"]
            kind = row["kind"]
            pred = row["predicted"].strip()
            exp = row["expected"].strip()

            sample_ids.add(row["sampleId"])
            total += 1
            by_kind[kind] += 1

            per_category[cat]["total"] += 1
            per_category[cat][kind] += 1
            if pred or exp:
                per_category[cat]["reviewable"] += 1
            if pred:
                per_category[cat]["pred_filled"] += 1
            if exp:
                per_category[cat]["exp_filled"] += 1

            field_to_category[fld] = cat
            per_field[fld]["total"] += 1
            per_field[fld][kind] += 1
            if pred:
                per_field[fld]["pred_filled"] += 1
            if exp:
                per_field[fld]["exp_filled"] += 1
            if pred or exp:
                per_field[fld]["reviewable"] += 1

    n_docs = len(sample_ids)

    # ---------- Summary printout ----------
    print(f"=== Overall ===")
    print(f"Total predictions:    {total}")
    print(f"Total documents:      {n_docs}")
    print(f"Matched:              {by_kind['matched']} ({by_kind['matched']/total*100:.2f}%)")
    print(f"Wrong:                {by_kind['wrong']}")
    print(f"Missing:              {by_kind['missing']}")
    print(f"Extra:                {by_kind['extra']}")
    print(f"Total errors:         {by_kind['wrong'] + by_kind['missing'] + by_kind['extra']}")
    print()

    print(f"=== Per category ===")
    print(f"{'category':<18} {'total':>6} {'matched':>8} {'wrong':>6} {'missing':>8} {'extra':>6} {'accuracy':>9} {'reviewable':>11} {'rev/doc':>8}")
    total_reviewable = 0
    for cat in CATEGORY_ORDER:
        s = per_category.get(cat, {})
        if not s:
            continue
        tot = s.get("total", 0)
        mat = s.get("matched", 0)
        wr = s.get("wrong", 0)
        mi = s.get("missing", 0)
        ex = s.get("extra", 0)
        rev = s.get("reviewable", 0)
        total_reviewable += rev
        acc = mat / tot * 100 if tot else 0
        print(f"{cat:<18} {tot:>6} {mat:>8} {wr:>6} {mi:>8} {ex:>6} {acc:>8.2f}% {rev:>11} {rev/n_docs:>8.2f}")

    print(f"\nTotal reviewable across all categories: {total_reviewable}")
    print(f"Reviewable fields per document avg:     {total_reviewable / n_docs:.2f}")

    # ---------- Estimate the no-fuzzy accuracy ----------
    # Strict accuracies (from V2 report Appendix 11.2, neural V2 strict):
    strict_acc = {
        "name": 0.6970,        # 30 errors out of 99 fields per row (but 2 fields)
        "freeform_text": 0.7475,
    }
    # The strict accuracy is applied to the same predictions_total
    # For overall "no fuzzy" estimate:
    # current errors: 267
    # Add back name fuzzy lift: (1 - 0.808) * 198 - current_name_errors
    # We need to know current per-cat errors:
    current_errors = {
        "name": per_category["name"].get("wrong", 0) + per_category["name"].get("missing", 0) + per_category["name"].get("extra", 0),
        "freeform_text": per_category["freeform_text"].get("wrong", 0) + per_category["freeform_text"].get("missing", 0) + per_category["freeform_text"].get("extra", 0),
    }
    # V2 strict per-category from V2 report:
    strict_v2 = {
        "name": 38,  # 80.81% × 198 = 160 correct, 38 errors
        "freeform_text": 25,  # 74.75% × 99 = 74 correct, 25 errors
    }
    name_delta = strict_v2["name"] - current_errors["name"]
    freeform_delta = strict_v2["freeform_text"] - current_errors["freeform_text"]
    total_errors_current = by_kind['wrong'] + by_kind['missing'] + by_kind['extra']
    no_fuzzy_errors = total_errors_current + name_delta + freeform_delta
    no_fuzzy_acc = (total - no_fuzzy_errors) / total * 100

    print(f"\n=== Accuracy estimates ===")
    print(f"With all normalisations (measured):       {(total - total_errors_current) / total * 100:.2f}%")
    print(f"Without fuzzy on name (estimated):        +{name_delta} errors")
    print(f"Without fuzzy on freeform (estimated):    +{freeform_delta} errors")
    print(f"Without fuzzy on either (estimated):      {no_fuzzy_acc:.2f}%")

    # ---------- Per-field CSV ----------
    header = [
        "category", "field", "total", "matched", "wrong", "missing", "extra",
        "predicted_filled", "expected_filled", "reviewable",
        "accuracy_pct",
    ]
    cat_rank = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    fields_sorted = sorted(
        per_field.keys(),
        key=lambda f: (cat_rank.get(field_to_category.get(f, ""), 99), f),
    )

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for fld in fields_sorted:
            s = per_field[fld]
            tot = s.get("total", 0)
            mat = s.get("matched", 0)
            acc = mat / tot * 100 if tot else 0
            w.writerow([
                field_to_category.get(fld, ""),
                fld,
                tot,
                mat,
                s.get("wrong", 0),
                s.get("missing", 0),
                s.get("extra", 0),
                s.get("pred_filled", 0),
                s.get("exp_filled", 0),
                s.get("reviewable", 0),
                f"{acc:.2f}",
            ])

    print(f"\nPer-field breakdown written to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
