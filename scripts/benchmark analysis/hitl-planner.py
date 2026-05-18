#!/usr/bin/env python3
"""
HITL capacity planner for the SDPR benchmark.

For a single engine and a small allowlist of high-impact field categories
(default: income / sin / phone), sweeps a target-recall ladder (50% / 70% /
80% / 90% / 95% / 99%) and reports per-category and combined HITL review
workload. Companion chart shows the per-category recall vs. workload curves
with the operating points marked.

HITL strategy modelled (per user direction, 2026-05-17): operator reviews
EVERY prediction whose confidence < T, regardless of whether the model
returned a value or null. Null predictions carry confidence scores too,
so they're valid signals — low-confidence "blank" predictions catch
`missing` errors. No skip-blank optimization, no recall ceiling.

For each (category, target_recall):
  - errors_total      = predictions where matched=false
  - target_count      = ceil(errors_total * target_recall)
  - The k-th smallest error-confidence is the highest we must flag.
  - T                 = round up that cutoff to 0.01 (the smallest
                        discrete operating threshold catching ≥ target).
  - flagged           = predictions with confidence < T
  - reviews_per_100   = flagged * 100 / docs_count
  - recall_actual     = errors_caught / errors_total (≥ target by
                        construction; often higher because confidence
                        steps are discrete).

Combined workload at each row = sum of per-category reviews_per_100. The
categories are chosen independently at each target — no uniform-threshold
constraint.

Usage:
    python hitl-planner.py <input.json> \\
        --out-dir <dir> \\
        --categories income_amounts,sin,phone \\
        --docs-count 99 \\
        --engine-label "Neural (V2)"
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# Field categorisation (matches compare-engines.py)
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


CATEGORY_COLOURS = {
    "sin": "#1f77b4",
    "phone": "#2ca02c",
    "name": "#d62728",
    "date": "#ff7f0e",
    "signature": "#9467bd",
    "freeform_text": "#8c564b",
    "case_id": "#e377c2",
    "checkboxes": "#7f7f7f",
    "income_amounts": "#17becf",
}


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclass
class Prediction:
    field: str
    category: str
    confidence: float
    matched: bool
    predicted_is_empty: bool      # the model returned null / empty for this cell
    expected_is_empty: bool       # ground truth is null / empty for this cell
    predicted_is_trivial: bool    # predicted is empty or "looks like 0" — see _predicted_looks_trivial


TARGET_RECALLS = [0.50, 0.70, 0.80, 0.90, 0.95, 0.99]


def _is_empty_value(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return v.strip() == ""
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


def _predicted_looks_trivial(value: Any) -> bool:
    """A prediction is 'trivial' if its operational meaning is 'no value to
    verify here'. This includes the empty case AND any value the normaliser
    would map to 0:

      - empty / null / whitespace
      - any single non-whitespace character (letter, digit, symbol) — the
        normaliser maps these to 0 when expected is 0 (income-single-char-
        zero / income-single-digit-to-zero rules)
      - any single-digit integer (0–9) reported as a number, not a string

    A trivial prediction is operationally equivalent to a blank: the operator
    sees nothing of substance to verify on the form. This rule depends only
    on the prediction (not on ground truth), so it can be applied in
    production where matched/unmatched isn't known at decision time.
    """
    if value is None:
        return True
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        # Single-digit integer-equivalent (0..9). Avoids treating 10, 10.5, etc.
        try:
            return -10 < value < 10 and float(value) == int(value)
        except (ValueError, OverflowError):
            return False
    if isinstance(value, str):
        stripped = value.strip()
        return len(stripped) <= 1
    return False


def load_predictions(path: Path) -> list[Prediction]:
    raw = json.loads(path.read_text("utf-8"))
    out: list[Prediction] = []
    for sample in raw.get("perSampleResults") or []:
        for det in sample.get("evaluationDetails") or []:
            field = det.get("field")
            conf = det.get("confidence")
            if not isinstance(field, str) or not isinstance(conf, (int, float)):
                continue
            predicted_raw = det.get("predicted") if "predicted" in det else None
            pred_empty = ("predicted" not in det) or _is_empty_value(predicted_raw)
            exp_empty = _is_empty_value(det.get("expected"))
            pred_trivial = pred_empty or _predicted_looks_trivial(predicted_raw)
            out.append(Prediction(
                field=field,
                category=classify_field(field),
                confidence=float(conf),
                matched=det.get("matched") is True,
                predicted_is_empty=pred_empty,
                expected_is_empty=exp_empty,
                predicted_is_trivial=pred_trivial,
            ))
    return out


def filter_predictions_for_category(
    preds: list[Prediction],
    category: str,
    exclude_missing: bool,
) -> list[Prediction]:
    """If `exclude_missing` is set, drop predictions that are a `missing`
    error (predicted empty, expected populated). Both matched and other
    error types stay. The semantic is "treat missing-class cells as out of
    scope for confidence-gated HITL" — they need a different safety layer.
    """
    if not exclude_missing:
        return preds
    out = []
    for p in preds:
        is_missing = (not p.matched) and p.predicted_is_empty and not p.expected_is_empty
        if is_missing:
            continue
        out.append(p)
    return out


# ---------------------------------------------------------------------------
# Per-category target-recall sweep
# ---------------------------------------------------------------------------


def _reviewable_default(p: Prediction) -> bool:
    """A prediction is reviewable if there is actually something to verify:
    either the model produced a value, or the form ground truth had one. If
    both sides are empty (correct blank), there's nothing for the operator
    to look at — these inflate the workload count if included. Excludes
    cells like spouse_sin on single-applicant forms where the form is
    blank, the model returned blank, and there is no content on the page
    to verify against."""
    return not (p.predicted_is_empty and p.expected_is_empty)


def _reviewable_skip_trivial(p: Prediction) -> bool:
    """For categories where trivial predictions carry no verification work
    (e.g. income — a single-digit or blank prediction operationally means
    'no income from this category', which the operator confirms in roughly
    the time it takes to glance at the form), exclude any prediction whose
    *predicted* value is empty or a single character (the same shapes the
    normaliser would map to 0). This is a prediction-side rule — it works
    in production where matched/unmatched isn't known at decision time."""
    return not p.predicted_is_trivial


def sweep_for_category(
    preds: list[Prediction],
    targets: list[float],
    docs_count: int,
    skip_trivial: bool = False,
) -> list[dict]:
    """For each target recall, find the smallest discrete threshold T (in
    0.01 steps) that flags ≥ target * total_errors errors, and report the
    HITL load + actual recall at that T.

    Workload metric (`reviews_per_100_docs`) counts only **reviewable**
    flagged predictions — those where the form actually has content to
    verify (either the model produced a value, or GT has one). Correctly-
    blank predictions don't count even when flagged below T, because the
    operator has nothing to compare against.
    """
    reviewable_fn = _reviewable_skip_trivial if skip_trivial else _reviewable_default
    errors = [p for p in preds if not p.matched]
    total_errors = len(errors)
    filled_predictions = sum(1 for p in preds if reviewable_fn(p))
    rows: list[dict] = []
    for target in targets:
        if total_errors == 0:
            rows.append({
                "target_recall": target,
                "threshold": None,
                "errors_caught": 0,
                "errors_total": 0,
                "predictions_flagged": 0,
                "predictions_reviewable_flagged": 0,
                "predictions_total": len(preds),
                "predictions_reviewable_total": filled_predictions,
                "reviews_per_100_docs": 0.0,
                "recall_actual": 0.0,
                "residual_errors": 0,
                "residual_errors_per_100_docs": 0.0,
            })
            continue
        target_count = int(np.ceil(total_errors * target))
        sorted_err_conf = sorted(p.confidence for p in errors)
        cutoff = sorted_err_conf[target_count - 1]
        # Threshold strictly greater than cutoff. Round up to 0.01.
        t = (np.ceil((cutoff + 1e-9) / 0.01) * 0.01).item()
        t = round(min(t, 1.00), 2)
        flagged = [p for p in preds if p.confidence < t]
        flagged_reviewable = [p for p in flagged if reviewable_fn(p)]
        errors_caught = sum(1 for p in flagged if not p.matched)
        residual = total_errors - errors_caught
        rows.append({
            "target_recall": target,
            "threshold": t,
            "errors_caught": errors_caught,
            "errors_total": total_errors,
            "predictions_flagged": len(flagged),
            "predictions_reviewable_flagged": len(flagged_reviewable),
            "predictions_total": len(preds),
            "predictions_reviewable_total": filled_predictions,
            "reviews_per_100_docs": len(flagged_reviewable) * 100 / docs_count if docs_count else 0.0,
            "recall_actual": errors_caught / total_errors,
            "residual_errors": residual,
            "residual_errors_per_100_docs": residual * 100 / docs_count if docs_count else 0.0,
        })
    return rows


def sweep_full_curve(
    preds: list[Prediction],
    docs_count: int,
    step: float = 0.01,
    skip_trivial: bool = False,
) -> list[dict]:
    """Continuous-threshold curve for plotting (X = reviews/100, Y = recall).
    Workload semantics match `sweep_for_category` — correct-blank cells are
    always excluded; trivial-predicted cells are also excluded when
    `skip_trivial` is set."""
    reviewable_fn = _reviewable_skip_trivial if skip_trivial else _reviewable_default
    errors_total = sum(1 for p in preds if not p.matched)
    if errors_total == 0:
        return []
    thresholds = [round(x, 2) for x in np.arange(0.0, 1.001, step)]
    rows = []
    for t in thresholds:
        flagged = [p for p in preds if p.confidence < t]
        flagged_reviewable = [p for p in flagged if reviewable_fn(p)]
        errors_caught = sum(1 for p in flagged if not p.matched)
        rows.append({
            "threshold": t,
            "reviews_per_100_docs": len(flagged_reviewable) * 100 / docs_count if docs_count else 0.0,
            "recall": errors_caught / errors_total,
        })
    return rows


# ---------------------------------------------------------------------------
# CSV writers
# ---------------------------------------------------------------------------


def write_per_category_csv(
    by_category: dict[str, list[dict]],
    out_path: Path,
) -> None:
    """One row per (category, target_recall)."""
    header = [
        "category", "target_recall", "threshold",
        "errors_caught", "errors_total",
        "predictions_flagged", "predictions_reviewable_flagged",
        "predictions_total", "predictions_reviewable_total",
        "reviews_per_100_docs", "recall_actual",
        "residual_errors", "residual_errors_per_100_docs",
    ]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for cat in CATEGORY_ORDER:
            rows = by_category.get(cat)
            if not rows:
                continue
            for r in rows:
                w.writerow([
                    cat,
                    f"{r['target_recall']:.2f}",
                    "" if r["threshold"] is None else f"{r['threshold']:.2f}",
                    r["errors_caught"],
                    r["errors_total"],
                    r["predictions_flagged"],
                    r["predictions_reviewable_flagged"],
                    r["predictions_total"],
                    r["predictions_reviewable_total"],
                    f"{r['reviews_per_100_docs']:.1f}",
                    f"{r['recall_actual']:.4f}",
                    r["residual_errors"],
                    f"{r['residual_errors_per_100_docs']:.1f}",
                ])


def write_combined_csv(
    by_category: dict[str, list[dict]],
    targets: list[float],
    docs_count: int,
    out_path: Path,
) -> None:
    """One row per target_recall; columns enumerate per-category T + load
    + residual/100, plus the combined load (sum of per-category loads) and
    combined residual errors (sum of per-category residuals)."""
    cats_present = [c for c in CATEGORY_ORDER if c in by_category]
    header = ["target_recall"]
    for c in cats_present:
        header += [
            f"T_{c}",
            f"{c}_reviews_per_100",
            f"{c}_residual_errors",
            f"{c}_residual_per_100_docs",
        ]
    header += [
        "combined_reviews_per_100",
        "combined_residual_errors",
        "combined_residual_per_100_docs",
        "combined_errors_total",
    ]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for idx, target in enumerate(targets):
            combined_load = 0.0
            combined_residual = 0
            combined_total = 0
            row = [f"{target:.2f}"]
            for c in cats_present:
                r = by_category[c][idx]
                t_str = "" if r["threshold"] is None else f"{r['threshold']:.2f}"
                row += [
                    t_str,
                    f"{r['reviews_per_100_docs']:.1f}",
                    r["residual_errors"],
                    f"{r['residual_errors_per_100_docs']:.1f}",
                ]
                combined_load += r["reviews_per_100_docs"]
                combined_residual += r["residual_errors"]
                combined_total += r["errors_total"]
            combined_residual_per_100 = (
                combined_residual * 100 / docs_count if docs_count else 0.0
            )
            row += [
                f"{combined_load:.1f}",
                combined_residual,
                f"{combined_residual_per_100:.1f}",
                combined_total,
            ]
            w.writerow(row)


# ---------------------------------------------------------------------------
# Plot
# ---------------------------------------------------------------------------


def plot_hitl_curves(
    by_category: dict[str, list[dict]],
    full_curves: dict[str, list[dict]],
    targets: list[float],
    out_path: Path,
    engine_label: str,
) -> None:
    """One subplot, log X-axis (reviews/100 docs), Y = recall %. One line
    per category, with dots marking the target-recall operating points."""
    cats_present = [c for c in CATEGORY_ORDER if c in by_category]
    fig, ax = plt.subplots(figsize=(10, 6.5))
    for cat in cats_present:
        curve = full_curves[cat]
        xs = [r["reviews_per_100_docs"] for r in curve]
        ys = [r["recall"] * 100 for r in curve]
        n_err = by_category[cat][0]["errors_total"]
        ax.plot(
            xs, ys,
            label=f"{cat} ({n_err} err)",
            color=CATEGORY_COLOURS.get(cat, "#333"),
            linewidth=2,
        )
        # Operating-point dots + T-value annotations. Stagger label
        # placement (alternate above-left / below-right per category index)
        # so labels don't overlap when two categories' dots cluster near
        # the same point.
        for j, r in enumerate(by_category[cat]):
            if r["threshold"] is None:
                continue
            x = r["reviews_per_100_docs"]
            y = r["recall_actual"] * 100
            ax.scatter(
                [x], [y],
                color=CATEGORY_COLOURS.get(cat, "#333"),
                edgecolor="black",
                s=55,
                zorder=5,
            )
            # Alternate the label offset so adjacent dots' labels don't
            # collide. Categories with the same operating-point density
            # get different offset directions per ix.
            offset_y = 8 if (j % 2 == 0) else -12
            ax.annotate(
                f"T={r['threshold']:.2f}",
                xy=(x, y),
                xytext=(4, offset_y),
                textcoords="offset points",
                fontsize=7,
                color=CATEGORY_COLOURS.get(cat, "#333"),
            )

    # Annotate the target-recall ladder along the right edge.
    for tgt in targets:
        ax.axhline(tgt * 100, color="grey", linestyle=":", linewidth=0.7, alpha=0.7)
        ax.text(
            ax.get_xlim()[1] if ax.get_xlim()[1] > 0 else 1,
            tgt * 100,
            f" {int(tgt * 100)}%",
            fontsize=8,
            color="grey",
            va="center",
        )

    ax.set_xscale("log")
    ax.set_xlim(left=1)
    ax.set_ylim(0, 102)
    ax.set_xlabel("Predictions flagged per 100 documents (log scale)")
    ax.set_ylabel("Errors caught (%)")
    ax.set_title(
        f"HITL trade-off — {engine_label}\n"
        f"Dotted reference lines = target recalls (50/70/80/90/95/99%). "
        f"Dots = smallest threshold catching ≥ target."
    )
    ax.grid(alpha=0.3, which="both")
    ax.legend(loc="lower right", fontsize=9)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="benchmark JSON path (or /dev/fd/N for FIFO)")
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument(
        "--categories",
        default="income_amounts,sin,phone",
        help='comma-separated category allowlist (default: "income_amounts,sin,phone")',
    )
    ap.add_argument("--docs-count", type=int, default=99)
    ap.add_argument("--engine-label", default="Neural (V2)")
    ap.add_argument(
        "--exclude-missing-in-categories",
        default="",
        help=(
            "comma-separated category list where `missing`-class errors "
            "(predicted empty, expected populated) are dropped from the HITL "
            "analysis entirely. Use this for categories where high-confidence "
            "missings are handled by a different safety layer (numeric-zero "
            "recovery, sanity rules, ICM cross-validation) and should not "
            "inflate the confidence-gated review workload."
        ),
    )
    ap.add_argument(
        "--skip-trivial-predictions-in-categories",
        default="",
        help=(
            "comma-separated category list where the workload metric should "
            "exclude predictions whose value is empty or a single character "
            "(values the normaliser maps to 0). Operationally, a single-char "
            "or blank prediction means 'no value to verify here' on the form "
            "and takes negligible reviewer time. The rule is prediction-only "
            "and works in production (no GT knowledge required). Errors are "
            "still counted in recall calculations — only workload is filtered."
        ),
    )
    args = ap.parse_args(argv)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    allowlist = [c.strip() for c in args.categories.split(",") if c.strip()]
    for c in allowlist:
        if c not in CATEGORY_ORDER:
            sys.stderr.write(f"warning: unknown category {c!r} — skipping\n")
    allowlist = [c for c in allowlist if c in CATEGORY_ORDER]
    if not allowlist:
        sys.stderr.write("error: no valid categories in --categories\n")
        return 2

    exclude_missing = {
        c.strip() for c in args.exclude_missing_in_categories.split(",")
        if c.strip()
    }
    skip_trivial = {
        c.strip() for c in args.skip_trivial_predictions_in_categories.split(",")
        if c.strip()
    }

    preds = load_predictions(Path(args.input))
    print(f"loaded {len(preds)} predictions", file=sys.stderr)

    by_cat_preds: dict[str, list[Prediction]] = {}
    for p in preds:
        if p.category in allowlist:
            by_cat_preds.setdefault(p.category, []).append(p)

    by_category_sweep: dict[str, list[dict]] = {}
    full_curves: dict[str, list[dict]] = {}
    for cat in allowlist:
        cat_preds = by_cat_preds.get(cat, [])
        if not cat_preds:
            continue
        n_before = len(cat_preds)
        cat_preds = filter_predictions_for_category(cat_preds, cat, cat in exclude_missing)
        n_after = len(cat_preds)
        if cat in exclude_missing:
            n_dropped = n_before - n_after
            print(
                f"  {cat}: dropped {n_dropped} missing-class predictions (--exclude-missing-in-categories)",
                file=sys.stderr,
            )
        cat_skip_trivial = cat in skip_trivial
        if cat_skip_trivial:
            n_trivial_in_pool = sum(1 for p in cat_preds if p.predicted_is_trivial)
            print(
                f"  {cat}: workload skips {n_trivial_in_pool} trivial-prediction cells (--skip-trivial-predictions-in-categories)",
                file=sys.stderr,
            )
        by_category_sweep[cat] = sweep_for_category(cat_preds, TARGET_RECALLS, args.docs_count, skip_trivial=cat_skip_trivial)
        full_curves[cat] = sweep_full_curve(cat_preds, args.docs_count, skip_trivial=cat_skip_trivial)

    write_per_category_csv(by_category_sweep, args.out_dir / "hitl-per-category.csv")
    write_combined_csv(by_category_sweep, TARGET_RECALLS, args.docs_count, args.out_dir / "hitl-combined.csv")
    plot_hitl_curves(
        by_category_sweep, full_curves, TARGET_RECALLS,
        args.out_dir / "hitl-curves.png", args.engine_label,
    )

    print(f"\nWrote outputs to {args.out_dir}/", file=sys.stderr)
    print("  CSVs:  hitl-per-category.csv, hitl-combined.csv", file=sys.stderr)
    print("  PNG:   hitl-curves.png", file=sys.stderr)
    # Summary line
    last = by_category_sweep
    for cat in allowlist:
        if cat not in last:
            continue
        n_err = last[cat][0]["errors_total"]
        print(f"  {cat}: {n_err} errors, target-recall sweep complete", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
