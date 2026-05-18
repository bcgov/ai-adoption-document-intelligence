#!/usr/bin/env python3
"""
Error-class audit reports for SDPR benchmark JSONs.

Usage:
    # Wrong-values report (one engine):
    python report-errors.py <input.json> --out-dir <dir>

    # Wrong-values report (multiple engines) + missing-comparison
    # (engines[0] is the baseline, engines[1..] are compared against it):
    python report-errors.py \\
        "Template (V1)=<input1.json>" \\
        "Neural (V2)=<input2.json>" \\
        --out-dir <dir>

Outputs (in <dir>):
    wrong-by-category.csv      — one row per non-matched (sampleId, field)
                                  cell from the target engine (the last
                                  one in argv; baseline first, target
                                  last by wrapper convention). Always-
                                  emitted columns: sampleId, category,
                                  field, kind, predicted, expected,
                                  confidence. `kind` is `wrong` / `missing`
                                  / `extra` (matches analyze.js).
                                  When ≥2 engines are passed, three extra
                                  columns are appended: baseline_kind,
                                  baseline_predicted, vs_baseline. The
                                  `vs_baseline` flag is one of regression
                                  (baseline matched, target errors), drift
                                  (both failed, different kinds), same-
                                  kind (both failed same way), or new-cell
                                  (baseline didn't evaluate the cell).
                                  Single-engine: sorted by category →
                                  field → sampleId. Multi-engine: sorted
                                  by vs_baseline rank (regressions first)
                                  → category → field → sampleId. Row count
                                  equals the target engine's "Total errors"
                                  in the .md report regardless of
                                  baseline presence.

    missing-comparison.csv     — only emitted when ≥2 engines passed. One
                                  row per (sampleId, field) that is a
                                  `missing` error in any non-baseline engine.
                                  Columns include the baseline's status at
                                  that cell (matched / missing / extra /
                                  wrong) and each non-baseline engine's
                                  status, plus a `flag` column highlighting
                                  the change relative to baseline.

Inputs may be `/dev/fd/N` for FIFO streaming.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Field categorisation — matches compare-engines.py
# ---------------------------------------------------------------------------

CATEGORY_ORDER = [
    "sin", "date", "phone", "name", "signature",
    "freeform_text", "case_id", "checkboxes", "income_amounts",
]


def classify_field(name: str) -> str:
    if name in ("sin", "spouse_sin"):
        return "sin"
    if name in ("date", "spouse_date"):
        return "date"
    if name in ("phone", "spouse_phone"):
        return "phone"
    if name in ("name", "spouse_name"):
        return "name"
    if name in ("signature", "spouse_signature"):
        return "signature"
    if name == "explain_changes":
        return "freeform_text"
    if name == "case_id":
        return "case_id"
    if name.startswith("checkbox_"):
        return "checkboxes"
    return "income_amounts"


# ---------------------------------------------------------------------------
# Error-type classification — same definitions as compare-engines.py
# ---------------------------------------------------------------------------


def is_empty(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return v.strip() == ""
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


def error_kind(matched: Any, expected: Any, predicted: Any) -> str:
    """Returns 'matched' / 'missing' / 'extra' / 'wrong' for a prediction."""
    if matched is True:
        return "matched"
    exp_empty = is_empty(expected)
    pred_empty = is_empty(predicted) or predicted is None
    if not exp_empty and pred_empty:
        return "missing"
    if exp_empty and not pred_empty:
        return "extra"
    return "wrong"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def parse_engine_arg(s: str) -> tuple[str, Path]:
    """Accept either 'LABEL=PATH' or a bare path (label = filename stem)."""
    if "=" in s:
        label, _, path = s.partition("=")
        return (label.strip(), Path(path.strip()))
    p = Path(s)
    return (p.stem, p)


def load_engine(label: str, path: Path) -> dict[tuple[str, str], dict]:
    """Returns {(sampleId, field) → {matched, predicted, expected, confidence, kind}}."""
    raw = json.loads(path.read_text("utf-8"))
    out: dict[tuple[str, str], dict] = {}
    for sample in raw.get("perSampleResults") or []:
        sid = sample.get("sampleId", "?")
        for det in sample.get("evaluationDetails") or []:
            field = det.get("field")
            if not isinstance(field, str):
                continue
            predicted = det.get("predicted") if "predicted" in det else None
            expected = det.get("expected") if "expected" in det else None
            matched = det.get("matched") is True
            out[(sid, field)] = {
                "matched": matched,
                "predicted": predicted,
                "expected": expected,
                "confidence": det.get("confidence"),
                "kind": error_kind(matched, expected, predicted),
            }
    print(f"loaded {label}: {len(out)} predictions from {path.name}", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# Report 1 — Condensed wrong-by-category
# ---------------------------------------------------------------------------


def serialize_value(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def _vs_baseline_flag(target_kind: str, baseline_kind: str) -> str:
    """Classify a target error against the baseline's status at the same
    (sampleId, field) cell. Helps surface where the target engine has
    regressed, drifted, or merely inherited a pre-existing failure."""
    if baseline_kind == "absent":
        return "new-cell"  # cell not evaluated in baseline
    if baseline_kind == "matched":
        return "regression"  # baseline got it right, target now errors
    if baseline_kind == target_kind:
        return "same-kind"  # both fail with the same error kind
    return "drift"  # both fail, but with different error kinds


def write_wrong_by_category_csv(
    target_label: str,
    target_preds: dict[tuple[str, str], dict],
    out_path: Path,
    baseline: tuple[str, dict[tuple[str, str], dict]] | None = None,
) -> int:
    """One row per non-matched (sampleId, field) cell from a SINGLE engine.

    Always-emitted columns:
        sampleId, category, field, kind, predicted, expected, confidence

    Where `kind` is `wrong` / `missing` / `extra` (matches analyze.js
    classification). Sorted by category → field → sampleId.

    When `baseline` is provided (multi-engine invocation), three extra
    columns are appended for cross-engine context:
        baseline_kind        — matched / wrong / missing / extra / absent
        baseline_predicted   — baseline's predicted value (raw)
        vs_baseline          — regression / drift / same-kind / new-cell

    With baseline context, rows are sorted by `vs_baseline` rank (most
    concerning first: regression > drift > same-kind > new-cell), then by
    category → field → sampleId, so the regressions surface at the top.

    Row count equals the target engine's "Total errors" as reported by
    analyze.js in the .md report — every non-matched cell shows up once,
    independent of whether baseline context is included.

    Returns the row count (caller verifies vs the .md total)."""
    rows: list[dict] = []
    baseline_preds = baseline[1] if baseline else None
    for (sid, field), info in target_preds.items():
        kind = info["kind"]
        if kind == "matched":
            continue
        row = {
            "sampleId": sid,
            "category": classify_field(field),
            "field": field,
            "kind": kind,
            "predicted": serialize_value(info["predicted"]),
            "expected": serialize_value(info["expected"]),
            "confidence": info["confidence"] if info["confidence"] is not None else "",
        }
        if baseline_preds is not None:
            b_info = baseline_preds.get((sid, field))
            b_kind = b_info["kind"] if b_info else "absent"
            b_pred = serialize_value(b_info["predicted"]) if b_info else ""
            row["baseline_kind"] = b_kind
            row["baseline_predicted"] = b_pred
            row["vs_baseline"] = _vs_baseline_flag(kind, b_kind)
        rows.append(row)

    cat_rank = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    if baseline_preds is not None:
        vs_rank = {"regression": 0, "drift": 1, "same-kind": 2, "new-cell": 3}
        rows.sort(key=lambda r: (
            vs_rank.get(r["vs_baseline"], 99),
            cat_rank.get(r["category"], 99),
            r["field"],
            r["sampleId"],
        ))
    else:
        rows.sort(key=lambda r: (
            cat_rank.get(r["category"], 99),
            r["field"],
            r["sampleId"],
        ))

    header = ["sampleId", "category", "field", "kind", "predicted", "expected", "confidence"]
    if baseline_preds is not None:
        header += ["baseline_kind", "baseline_predicted", "vs_baseline"]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow([r[c] for c in header])

    by_kind: dict[str, int] = defaultdict(int)
    by_vs: dict[str, int] = defaultdict(int)
    for r in rows:
        by_kind[r["kind"]] += 1
        if "vs_baseline" in r:
            by_vs[r["vs_baseline"]] += 1
    msg = f"wrote {out_path} ({len(rows)} non-matched cells from '{target_label}'; by kind: {dict(by_kind)}"
    if baseline_preds is not None:
        msg += f"; vs baseline '{baseline[0]}': {dict(by_vs)}"
    msg += ")"
    print(msg, file=sys.stderr)
    return len(rows)


# ---------------------------------------------------------------------------
# Report 2 — Missing-comparison
# ---------------------------------------------------------------------------


def write_missing_comparison_csv(
    engines: list[tuple[str, dict[tuple[str, str], dict]]],
    out_path: Path,
) -> None:
    """One row per (sampleId, field) that has a `missing` error in any
    non-baseline engine. Columns:
        sampleId, field, category, expected,
        <baseline-label>_kind, <baseline-label>_predicted,
        <other-label>_kind, <other-label>_predicted, ...
        flag

    `flag` summarises the change vs. baseline for the FIRST non-baseline
    engine (typical case: just two engines compared):
        - 'new in <eng>'         : baseline matched here, engine now missing
        - 'regressed from <kind>': baseline had a different error class here
        - 'still missing'        : baseline already missing here
    """
    if len(engines) < 2:
        return
    baseline_label, baseline_preds = engines[0]
    others = engines[1:]

    # Find all (sample, field) cells that are missing in ANY non-baseline.
    interest_keys: set[tuple[str, str]] = set()
    for _, preds in others:
        for k, info in preds.items():
            if info["kind"] == "missing":
                interest_keys.add(k)

    header = ["sampleId", "field", "category", "expected"]
    header += [f"{baseline_label}_kind", f"{baseline_label}_predicted"]
    for label, _ in others:
        header += [f"{label}_kind", f"{label}_predicted"]
    header += ["flag"]

    rows = []
    for sid, field in sorted(interest_keys):
        category = classify_field(field)
        b = baseline_preds.get((sid, field), {})
        expected = b.get("expected") if "expected" in b else None
        # If baseline doesn't have this key at all (rare — sample/field
        # present in one engine but not the other), expected comes from any
        # non-baseline.
        if expected is None or is_empty(expected):
            for _, p in others:
                cand = p.get((sid, field), {})
                if cand.get("expected") and not is_empty(cand["expected"]):
                    expected = cand["expected"]
                    break

        row = [sid, field, category, serialize_value(expected)]
        b_kind = b.get("kind", "absent")
        row += [b_kind, serialize_value(b.get("predicted"))]

        first_other_kind: str | None = None
        for label, p in others:
            info = p.get((sid, field), {})
            row += [info.get("kind", "absent"), serialize_value(info.get("predicted"))]
            if first_other_kind is None:
                first_other_kind = info.get("kind", "absent")

        # Flag the change vs. baseline for the first non-baseline engine.
        if first_other_kind != "missing":
            flag = "(non-missing, included for context)"
        elif b_kind == "matched":
            flag = f"new in {others[0][0]}"
        elif b_kind == "missing":
            flag = "still missing"
        elif b_kind == "absent":
            flag = f"new in {others[0][0]} (not evaluated in baseline)"
        else:
            flag = f"regressed from {b_kind}"
        row.append(flag)
        rows.append(row)

    # Sort: flag (new first), category, field, sampleId.
    flag_rank = {
        f"new in {others[0][0]}": 0,
        f"new in {others[0][0]} (not evaluated in baseline)": 1,
        "regressed from wrong": 2,
        "regressed from extra": 3,
        "still missing": 4,
        "(non-missing, included for context)": 5,
    }
    cat_rank = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    rows.sort(key=lambda r: (
        flag_rank.get(r[-1], 99),
        cat_rank.get(r[2], 99),
        r[1],  # field
        r[0],  # sampleId
    ))

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)

    # Summary to stderr.
    counts_by_flag: dict[str, int] = defaultdict(int)
    for r in rows:
        counts_by_flag[r[-1]] += 1
    print(f"wrote {out_path} ({len(rows)} (sample,field) cells)", file=sys.stderr)
    for k, n in sorted(counts_by_flag.items(), key=lambda x: -x[1]):
        print(f"  {k}: {n}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "engines",
        nargs="+",
        type=parse_engine_arg,
        help='one or more LABEL=PATH pairs (or bare paths; label = filename stem)',
    )
    ap.add_argument("--out-dir", required=True, type=Path)
    args = ap.parse_args(argv)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    engines: list[tuple[str, dict[tuple[str, str], dict]]] = []
    for label, path in args.engines:
        if not path.exists():
            print(f"error: file not found: {path}", file=sys.stderr)
            return 1
        engines.append((label, load_engine(label, path)))

    # wrong-by-category is per-engine; the LAST engine in argv is the target
    # (by convention the wrapper passes baseline first, target last). When
    # ≥2 engines are passed, the first becomes baseline context for the
    # report.
    target_label, target_preds = engines[-1]
    baseline = engines[0] if len(engines) >= 2 else None
    write_wrong_by_category_csv(
        target_label, target_preds, args.out_dir / "wrong-by-category.csv",
        baseline=baseline,
    )
    if len(engines) >= 2:
        write_missing_comparison_csv(engines, args.out_dir / "missing-comparison.csv")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
