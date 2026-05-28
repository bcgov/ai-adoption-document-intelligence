#!/usr/bin/env python3
"""Generate individual per-category HITL plots showing the full continuous
threshold sweep. One PNG per category, plus one combined overview.

Usage:
    python hitl-per-category-plots.py <input.json> \
        --out-dir <dir> \
        --categories income_amounts,sin,phone,name,date \
        [--exclude-missing-in-categories income_amounts] \
        [--skip-trivial-predictions-in-categories income_amounts] \
        [--docs-count 99]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from importlib import import_module

planner = import_module("hitl-planner")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def plot_single_category(
    cat: str,
    sweep_rows: list[dict],
    full_curve: list[dict],
    targets: list[float],
    out_path: Path,
) -> None:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))

    xs = [r["reviews_per_100_docs"] for r in full_curve]
    ys = [r["recall"] * 100 for r in full_curve]
    ts = [r["threshold"] for r in full_curve]
    colour = planner.CATEGORY_COLOURS.get(cat, "#333")

    # Left panel: recall vs reviews (log scale) — same as the combined chart
    ax1.plot(xs, ys, color=colour, linewidth=2)
    for r in sweep_rows:
        if r["threshold"] is None:
            continue
        ax1.scatter([r["reviews_per_100_docs"]], [r["recall_actual"] * 100],
                    color=colour, edgecolor="black", s=70, zorder=5)
        ax1.annotate(
            f"T={r['threshold']:.2f}\n{r['predictions_reviewable_flagged']}/{r['predictions_reviewable_total']} flagged",
            xy=(r["reviews_per_100_docs"], r["recall_actual"] * 100),
            xytext=(8, -8), textcoords="offset points", fontsize=8,
        )

    for tgt in targets:
        ax1.axhline(tgt * 100, color="grey", linestyle=":", linewidth=0.7, alpha=0.5)

    ax1.set_xscale("log")
    ax1.set_xlim(left=1)
    ax1.set_ylim(0, 105)
    ax1.set_xlabel("Reviews per 100 documents (log scale)")
    ax1.set_ylabel("Errors caught (%)")
    ax1.set_title(f"{cat} — recall vs review workload")
    ax1.grid(alpha=0.3, which="both")

    # Right panel: threshold vs reviews (linear) — shows the cliff
    ax2.plot(ts, xs, color=colour, linewidth=2)
    for r in sweep_rows:
        if r["threshold"] is None:
            continue
        ax2.scatter([r["threshold"]], [r["reviews_per_100_docs"]],
                    color=colour, edgecolor="black", s=70, zorder=5)
        ax2.annotate(
            f"{int(r['target_recall']*100)}% recall",
            xy=(r["threshold"], r["reviews_per_100_docs"]),
            xytext=(6, 6), textcoords="offset points", fontsize=8,
        )

    ax2.set_xlabel("Confidence threshold T")
    ax2.set_ylabel("Reviews per 100 documents")
    ax2.set_title(f"{cat} — threshold vs review workload")
    ax2.grid(alpha=0.3)

    n_err = sweep_rows[0]["errors_total"]
    n_reviewable = sweep_rows[0]["predictions_reviewable_total"]
    fig.suptitle(
        f"{cat}: {n_err} errors, {n_reviewable} reviewable predictions across 99 docs",
        fontsize=12, fontweight="bold",
    )
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--categories", default="income_amounts,sin,phone,name,date")
    ap.add_argument("--docs-count", type=int, default=99)
    ap.add_argument("--exclude-missing-in-categories", default="")
    ap.add_argument("--skip-trivial-predictions-in-categories", default="")
    args = ap.parse_args(argv)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    allowlist = [c.strip() for c in args.categories.split(",") if c.strip()]
    allowlist = [c for c in allowlist if c in planner.CATEGORY_ORDER]

    exclude_missing = {c.strip() for c in args.exclude_missing_in_categories.split(",") if c.strip()}
    skip_trivial = {c.strip() for c in args.skip_trivial_predictions_in_categories.split(",") if c.strip()}

    preds = planner.load_predictions(Path(args.input))
    print(f"loaded {len(preds)} predictions", file=sys.stderr)

    by_cat_preds: dict[str, list] = {}
    for p in preds:
        if p.category in allowlist:
            by_cat_preds.setdefault(p.category, []).append(p)

    for cat in allowlist:
        cat_preds = by_cat_preds.get(cat, [])
        if not cat_preds:
            continue
        cat_preds = planner.filter_predictions_for_category(cat_preds, cat, cat in exclude_missing)
        cat_skip = cat in skip_trivial
        sweep = planner.sweep_for_category(cat_preds, planner.TARGET_RECALLS, args.docs_count, skip_trivial=cat_skip)
        curve = planner.sweep_full_curve(cat_preds, args.docs_count, step=0.005, skip_trivial=cat_skip)

        out_path = args.out_dir / f"hitl-detail-{cat}.png"
        plot_single_category(cat, sweep, curve, planner.TARGET_RECALLS, out_path)
        print(f"  {cat} → {out_path}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
