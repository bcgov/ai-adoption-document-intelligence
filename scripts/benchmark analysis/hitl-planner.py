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


TARGET_RECALLS = [0.50, 0.70, 0.80, 0.90, 0.95, 0.99]


def load_predictions(path: Path) -> list[Prediction]:
    raw = json.loads(path.read_text("utf-8"))
    out: list[Prediction] = []
    for sample in raw.get("perSampleResults") or []:
        for det in sample.get("evaluationDetails") or []:
            field = det.get("field")
            conf = det.get("confidence")
            if not isinstance(field, str) or not isinstance(conf, (int, float)):
                continue
            out.append(Prediction(
                field=field,
                category=classify_field(field),
                confidence=float(conf),
                matched=det.get("matched") is True,
            ))
    return out


# ---------------------------------------------------------------------------
# Per-category target-recall sweep
# ---------------------------------------------------------------------------


def sweep_for_category(
    preds: list[Prediction],
    targets: list[float],
    docs_count: int,
) -> list[dict]:
    """For each target recall, find the smallest discrete threshold T (in
    0.01 steps) that flags ≥ target * total_errors errors, and report the
    HITL load + actual recall at that T."""
    errors = [p for p in preds if not p.matched]
    total_errors = len(errors)
    rows: list[dict] = []
    for target in targets:
        if total_errors == 0:
            rows.append({
                "target_recall": target,
                "threshold": None,
                "errors_caught": 0,
                "errors_total": 0,
                "predictions_flagged": 0,
                "predictions_total": len(preds),
                "reviews_per_100_docs": 0.0,
                "recall_actual": 0.0,
                "residual_errors": 0,
            })
            continue
        target_count = int(np.ceil(total_errors * target))
        sorted_err_conf = sorted(p.confidence for p in errors)
        cutoff = sorted_err_conf[target_count - 1]
        # Threshold strictly greater than cutoff. Round up to 0.01.
        t = (np.ceil((cutoff + 1e-9) / 0.01) * 0.01).item()
        t = round(min(t, 1.00), 2)
        flagged = [p for p in preds if p.confidence < t]
        errors_caught = sum(1 for p in flagged if not p.matched)
        rows.append({
            "target_recall": target,
            "threshold": t,
            "errors_caught": errors_caught,
            "errors_total": total_errors,
            "predictions_flagged": len(flagged),
            "predictions_total": len(preds),
            "reviews_per_100_docs": len(flagged) * 100 / docs_count if docs_count else 0.0,
            "recall_actual": errors_caught / total_errors,
            "residual_errors": total_errors - errors_caught,
        })
    return rows


def sweep_full_curve(
    preds: list[Prediction],
    docs_count: int,
    step: float = 0.01,
) -> list[dict]:
    """Continuous-threshold curve for plotting (X = reviews/100, Y = recall)."""
    errors_total = sum(1 for p in preds if not p.matched)
    if errors_total == 0:
        return []
    thresholds = [round(x, 2) for x in np.arange(0.0, 1.001, step)]
    rows = []
    for t in thresholds:
        flagged = [p for p in preds if p.confidence < t]
        errors_caught = sum(1 for p in flagged if not p.matched)
        rows.append({
            "threshold": t,
            "reviews_per_100_docs": len(flagged) * 100 / docs_count if docs_count else 0.0,
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
        "predictions_flagged", "predictions_total",
        "reviews_per_100_docs", "recall_actual", "residual_errors",
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
                    r["predictions_total"],
                    f"{r['reviews_per_100_docs']:.1f}",
                    f"{r['recall_actual']:.4f}",
                    r["residual_errors"],
                ])


def write_combined_csv(
    by_category: dict[str, list[dict]],
    targets: list[float],
    out_path: Path,
) -> None:
    """One row per target_recall; columns enumerate per-category T + load,
    plus the combined load (sum of per-category loads) and combined
    residual errors (sum of per-category residuals)."""
    cats_present = [c for c in CATEGORY_ORDER if c in by_category]
    header = ["target_recall"]
    for c in cats_present:
        header += [f"T_{c}", f"{c}_reviews_per_100", f"{c}_residual_errors"]
    header += ["combined_reviews_per_100", "combined_residual_errors", "combined_errors_total"]
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
                row += [t_str, f"{r['reviews_per_100_docs']:.1f}", r["residual_errors"]]
                combined_load += r["reviews_per_100_docs"]
                combined_residual += r["residual_errors"]
                combined_total += r["errors_total"]
            row += [f"{combined_load:.1f}", combined_residual, combined_total]
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
        # Operating-point dots
        for r in by_category[cat]:
            if r["threshold"] is None:
                continue
            ax.scatter(
                [r["reviews_per_100_docs"]],
                [r["recall_actual"] * 100],
                color=CATEGORY_COLOURS.get(cat, "#333"),
                edgecolor="black",
                s=55,
                zorder=5,
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
        by_category_sweep[cat] = sweep_for_category(cat_preds, TARGET_RECALLS, args.docs_count)
        full_curves[cat] = sweep_full_curve(cat_preds, args.docs_count)

    write_per_category_csv(by_category_sweep, args.out_dir / "hitl-per-category.csv")
    write_combined_csv(by_category_sweep, TARGET_RECALLS, args.out_dir / "hitl-combined.csv")
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
