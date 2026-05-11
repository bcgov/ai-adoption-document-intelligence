#!/usr/bin/env python3
"""
Cross-engine comparison analysis for E00 / E02 / E03 / E04 / E05.

Reads each engine's `experiments/results/<slug>/benchmark-run.json` (already
re-evaluated against the current local GT by
`apps/temporal/src/scripts/reevaluate-against-local-gt.ts`), computes per-engine
aggregates and per-field accuracy, classifies each field into a category, and
emits:

  - PNG plots (overall metrics, per-sample f1 distributions, per-field
    accuracy heatmap, per-category accuracy bars)
  - per-engine + per-field accuracy CSV
  - per-engine + per-category accuracy CSV
  - per-field "best engine" pick (CSV) — the input for the E06 ensemble combiner.

Run from repo root or anywhere — paths are absolute relative to this file.
"""

import csv
import json
import os
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[4]
RESULTS_DIR = REPO_ROOT / "experiments" / "results"
OUT_DIR = RESULTS_DIR / "06-engine-ensemble"
PLOTS_DIR = OUT_DIR / "plots"
DATA_DIR = OUT_DIR / "data"
PLOTS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

ENGINES = [
    ("E00", "00-doc-intelligence-template", "Azure DI custom template"),
    ("E02", "02-mistral-doc-ai-azure", "Mistral on Foundry"),
    ("E03", "03-content-understanding", "Azure CU + gpt-5.2"),
    ("E04", "04-vlm-direct", "gpt-5.4 VLM-direct"),
    ("E05", "05-vlm-ocr-hybrid", "gpt-5.4 VLM + Azure DI layout"),
]
INCLUDE_E06 = os.environ.get("INCLUDE_E06", "0") == "1"
if INCLUDE_E06:
    ENGINES = ENGINES + [("E06", "06-engine-ensemble", "ensemble (per-field weighted)")]
ENGINE_COLORS = {
    "E00": "#7f7f7f",
    "E02": "#1f77b4",
    "E03": "#2ca02c",
    "E04": "#d62728",
    "E05": "#9467bd",
    "E06": "#ff7f0e",
}


def classify_field(field: str) -> str:
    if field.startswith("checkbox_"):
        return "checkboxes"
    if field in {"sin", "spouse_sin"}:
        return "sin"
    if field in {"date", "spouse_date"}:
        return "date"
    if field in {"phone", "spouse_phone"}:
        return "phone"
    if field in {"name", "spouse_name"}:
        return "name"
    if field in {"signature", "spouse_signature"}:
        return "signature"
    if field == "explain_changes":
        return "freeform_text"
    # All remaining fields are numeric income amounts
    return "income_amounts"


def load_run(slug: str) -> dict:
    path = RESULTS_DIR / slug / "benchmark-run.json"
    with open(path) as f:
        return json.load(f)


def main() -> None:
    runs = {tag: load_run(slug) for tag, slug, _ in ENGINES}

    # ---- 1. Aggregate metrics
    agg_rows = []
    for tag, slug, label in ENGINES:
        m = runs[tag]["metrics"]
        agg_rows.append({
            "engine": tag,
            "label": label,
            "pass_rate": m.get("pass_rate", 0),
            "f1_median": m.get("f1.median", 0),
            "f1_mean": m.get("f1.mean", 0),
            "precision_mean": m.get("precision.mean", 0),
            "recall_mean": m.get("recall.mean", 0),
            "matched_median": m.get("matchedFields.median", 0),
            "fp_mean": m.get("falsePositives.mean", 0),
        })
    with open(DATA_DIR / "aggregate-metrics.csv", "w") as f:
        w = csv.DictWriter(f, fieldnames=list(agg_rows[0].keys()))
        w.writeheader()
        w.writerows(agg_rows)

    # ---- 2. Plot: overall metrics bar chart
    metric_names = ["pass_rate", "f1_median", "f1_mean", "precision_mean", "recall_mean"]
    metric_labels = ["pass_rate", "f1.median", "f1.mean", "precision.mean", "recall.mean"]
    fig, ax = plt.subplots(figsize=(12, 5.5))
    x = np.arange(len(metric_names))
    n_eng = len(ENGINES)
    bar_w = 0.85 / n_eng
    offset_start = -(n_eng - 1) / 2 * bar_w
    for i, (tag, _, label) in enumerate(ENGINES):
        vals = [next(r for r in agg_rows if r["engine"] == tag)[m] for m in metric_names]
        ax.bar(x + offset_start + i * bar_w, vals, bar_w, label=f"{tag} — {label}", color=ENGINE_COLORS[tag])
    ax.set_xticks(x)
    ax.set_xticklabels(metric_labels)
    ax.set_ylim(0.4, 1.02)
    ax.set_ylabel("score (0–1)")
    ax.set_title("Aggregate metrics by engine (strict + cleaned GT)")
    ax.legend(loc="lower right", fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "01-aggregate-metrics.png", dpi=140)
    plt.close(fig)

    # ---- 3. Per-sample f1 distributions
    per_sample = {}
    sample_ids = None
    for tag, _, _ in ENGINES:
        samples = runs[tag]["perSampleResults"]
        d = {}
        for s in samples:
            if s.get("sampleId") == "manifest":
                continue
            d[s["sampleId"]] = (s.get("metrics") or {}).get("f1", 0.0) or 0.0
        per_sample[tag] = d
        if sample_ids is None:
            sample_ids = sorted(d.keys())

    fig, ax = plt.subplots(figsize=(8, 5))
    data = [list(per_sample[tag].values()) for tag, _, _ in ENGINES]
    bp = ax.boxplot(
        data, labels=[t for t, _, _ in ENGINES], patch_artist=True, widths=0.55
    )
    for patch, (tag, _, _) in zip(bp["boxes"], ENGINES):
        patch.set_facecolor(ENGINE_COLORS[tag])
        patch.set_alpha(0.6)
    ax.set_ylabel("per-sample F1")
    ax.set_title("Per-sample F1 distribution (40 samples, strict eval)")
    ax.set_ylim(0.45, 1.02)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "02-per-sample-f1-distribution.png", dpi=140)
    plt.close(fig)

    # ---- 4. Per-field accuracy
    per_field = defaultdict(dict)
    all_fields: set[str] = set()
    for tag, _, _ in ENGINES:
        for pf in runs[tag].get("perFieldResults", []):
            field = pf["field"]
            per_field[field][tag] = pf.get("accuracy", 0.0)
            all_fields.add(field)
    sorted_fields = sorted(all_fields, key=lambda f: (classify_field(f), f))

    with open(DATA_DIR / "per-field-accuracy.csv", "w") as f:
        w = csv.writer(f)
        w.writerow(["field", "category"] + [tag for tag, _, _ in ENGINES])
        for field in sorted_fields:
            w.writerow(
                [field, classify_field(field)]
                + [f"{per_field[field].get(tag, 0):.4f}" for tag, _, _ in ENGINES]
            )

    # ---- 5. Per-category accuracy
    cat_field_lists: dict[str, list[str]] = defaultdict(list)
    for f in sorted_fields:
        cat_field_lists[classify_field(f)].append(f)

    per_category: dict[str, dict[str, float]] = {}
    for cat, fields_in_cat in cat_field_lists.items():
        d: dict[str, float] = {}
        for tag, _, _ in ENGINES:
            vals = [per_field[f].get(tag, 0.0) for f in fields_in_cat]
            d[tag] = float(np.mean(vals)) if vals else 0.0
        per_category[cat] = d

    with open(DATA_DIR / "per-category-accuracy.csv", "w") as f:
        w = csv.writer(f)
        w.writerow(["category", "n_fields"] + [tag for tag, _, _ in ENGINES])
        for cat in sorted(per_category.keys()):
            w.writerow(
                [cat, len(cat_field_lists[cat])]
                + [f"{per_category[cat][tag]:.4f}" for tag, _, _ in ENGINES]
            )

    # ---- 6. Plot: per-category accuracy bar chart
    cat_order = [
        "sin", "date", "phone", "name", "signature", "freeform_text",
        "checkboxes", "income_amounts",
    ]
    cat_order = [c for c in cat_order if c in per_category]
    fig, ax = plt.subplots(figsize=(12, 5.5))
    x = np.arange(len(cat_order))
    bar_w = 0.85 / len(ENGINES)
    offset_start = -(len(ENGINES) - 1) / 2 * bar_w
    for i, (tag, _, _) in enumerate(ENGINES):
        vals = [per_category[c][tag] for c in cat_order]
        ax.bar(x + offset_start + i * bar_w, vals, bar_w,
               label=tag, color=ENGINE_COLORS[tag])
    ax.set_xticks(x)
    ax.set_xticklabels([
        f"{c}\n({len(cat_field_lists[c])} fields)" for c in cat_order
    ])
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("field accuracy (mean over fields in category)")
    ax.set_title("Per-category field accuracy by engine")
    ax.legend(loc="lower left", fontsize=10)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "03-per-category-accuracy.png", dpi=140)
    plt.close(fig)

    # ---- 7. Plot: per-field heatmap (sort by category then accuracy)
    field_order = []
    for cat in cat_order:
        # Sort fields within category by mean accuracy descending
        fs = sorted(
            cat_field_lists[cat],
            key=lambda f: -float(np.mean([per_field[f].get(t, 0) for t, _, _ in ENGINES])),
        )
        field_order.extend(fs)
    mat = np.array([
        [per_field[f].get(tag, 0.0) for tag, _, _ in ENGINES]
        for f in field_order
    ])
    fig, ax = plt.subplots(figsize=(8, max(8, 0.18 * len(field_order))))
    im = ax.imshow(mat, aspect="auto", cmap="RdYlGn", vmin=0.4, vmax=1.0)
    ax.set_xticks(range(len(ENGINES)))
    ax.set_xticklabels([t for t, _, _ in ENGINES])
    ax.set_yticks(range(len(field_order)))
    ax.set_yticklabels(field_order, fontsize=7)
    ax.set_title("Per-field accuracy (40 samples)")
    # Draw category separators
    boundaries = []
    cum = 0
    for cat in cat_order:
        cum += len(cat_field_lists[cat])
        boundaries.append(cum - 0.5)
    for b in boundaries[:-1]:
        ax.axhline(b, color="black", linewidth=1.2)
    plt.colorbar(im, ax=ax, label="accuracy")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "04-per-field-heatmap.png", dpi=140)
    plt.close(fig)

    # ---- 8. Best engine per field (for ensemble combiner)
    best_per_field = []
    for field in sorted_fields:
        scores = {tag: per_field[field].get(tag, 0.0) for tag, _, _ in ENGINES}
        max_score = max(scores.values())
        best = [t for t, s in scores.items() if s == max_score]
        best_per_field.append({
            "field": field,
            "category": classify_field(field),
            **{tag: f"{scores[tag]:.4f}" for tag in scores},
            "best_engines": ",".join(best),
            "best_accuracy": f"{max_score:.4f}",
        })
    with open(DATA_DIR / "best-engine-per-field.csv", "w") as f:
        w = csv.DictWriter(f, fieldnames=list(best_per_field[0].keys()))
        w.writeheader()
        w.writerows(best_per_field)

    # ---- 9. Plot: per-sample f1 by engine (sorted by mean f1 of best engine across samples)
    fig, ax = plt.subplots(figsize=(14, 6))
    # Sort samples by E05 (or first 1.000 engine) accuracy; fallback to E00
    sort_key = "E05" if "E05" in per_sample else ENGINES[0][0]
    sids = sorted(sample_ids, key=lambda s: -per_sample[sort_key][s])
    x = np.arange(len(sids))
    bar_w = 0.85 / len(ENGINES)
    offset_start = -(len(ENGINES) - 1) / 2 * bar_w
    for i, (tag, _, _) in enumerate(ENGINES):
        vals = [per_sample[tag][s] for s in sids]
        ax.bar(x + offset_start + i * bar_w, vals, bar_w,
               label=tag, color=ENGINE_COLORS[tag])
    ax.set_xticks(x)
    ax.set_xticklabels(sids, rotation=80, fontsize=7)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("F1 score")
    ax.set_title(f"Per-sample F1 across 40 samples (sorted by {sort_key} descending)")
    ax.legend(loc="lower left", fontsize=10)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "05-per-sample-f1-grouped.png", dpi=140)
    plt.close(fig)

    # ---- 10. Print summary
    print("\n== Aggregate metrics ==")
    for r in agg_rows:
        print(
            f"  {r['engine']} ({r['label']:34s}) pass_rate={r['pass_rate']:.3f} "
            f"f1.median={r['f1_median']:.3f} f1.mean={r['f1_mean']:.3f} "
            f"matched.median={int(r['matched_median'])} fp.mean={r['fp_mean']:.3f}"
        )
    print("\n== Per-category accuracy (mean over fields in category) ==")
    header = f"  {'category':18s}" + "".join(f"  {tag:>6s}" for tag, _, _ in ENGINES) + "  best_engine"
    print(header)
    for cat in cat_order:
        row = f"  {cat:18s}"
        scores = per_category[cat]
        max_s = max(scores.values())
        best = [t for t, s in scores.items() if s == max_s]
        for tag, _, _ in ENGINES:
            mark = "*" if tag in best else " "
            row += f" {mark}{scores[tag]:5.3f}"
        row += f"   {','.join(best)} ({max_s:.3f})"
        print(row)

    print(f"\n✓ Wrote outputs to {OUT_DIR}")


if __name__ == "__main__":
    main()
