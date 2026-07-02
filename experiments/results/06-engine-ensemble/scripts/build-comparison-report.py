#!/usr/bin/env python3
"""
Cross-engine comparison analysis for E00 / E02 / E03 / E04 / E05 / E07 / E08
(+ E06 when INCLUDE_E06=1).

Reads each engine's `experiments/results/<slug>/benchmark-run.json` (already
re-evaluated against the current local GT by
`apps/temporal/src/scripts/reevaluate-against-local-gt.ts`), computes per-engine
aggregates and per-field accuracy, classifies each field into a category, and
emits PNG plots + CSVs to `experiments/results/report/`.

Plots produced:
  01-aggregate-metrics.png            — grouped bars, f1.median / f1.mean /
                                        precision.mean / recall.mean / field_accuracy
                                        (drops pass_rate; pass_rate is a 0.8 threshold
                                        toggle and most engines cap out at 1.0).
  02-per-sample-f1-distribution.png   — box plot, legend with full engine names.
  03-per-category-accuracy.png        — per-category grouped bars.
  04-per-field-heatmap.png            — 74-row heatmap (fields × engines).
  05-per-sample-heatmap.png           — 40-row heatmap (samples × engines),
                                        replaces the grouped bars chart.
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
OUT_DIR = RESULTS_DIR / "report"
PLOTS_DIR = OUT_DIR / "plots"
DATA_DIR = OUT_DIR / "data"
PLOTS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

# (tag, slug, short_label, full_name)
ENGINES = [
    ("E00", "00-doc-intelligence-template", "Azure DI custom template", "E00 — Azure DI custom template"),
    ("E01", "01-neural-doc-intelligence", "Azure DI Neural custom", "E01 — Azure DI Neural custom model"),
    ("E02", "02-mistral-doc-ai-azure", "Mistral on Foundry", "E02 — Mistral on Azure Foundry"),
    ("E03", "03-content-understanding", "Azure CU + gpt-5.2", "E03 — Azure Content Understanding + gpt-5.2"),
    ("E04", "04-vlm-direct", "gpt-5.4 VLM-direct", "E04 — gpt-5.4 vision-language model (direct)"),
    ("E05", "05-vlm-ocr-hybrid", "gpt-5.4 VLM + Azure DI layout", "E05 — gpt-5.4 VLM + Azure DI prebuilt-layout (hybrid)"),
    ("E07", "07-vlm-ocr-hybrid-gpt-4o", "gpt-4o VLM + Azure DI layout", "E07 — gpt-4o VLM + Azure DI prebuilt-layout (hybrid)"),
    ("E08", "08-vlm-ocr-hybrid-gpt-5.2", "gpt-5.2 VLM + Azure DI layout", "E08 — gpt-5.2 VLM + Azure DI prebuilt-layout (hybrid)"),
]
# E06 is included by default — pass INCLUDE_E06=0 to skip it (rarely useful).
INCLUDE_E06 = os.environ.get("INCLUDE_E06", "1") == "1"
if INCLUDE_E06:
    ENGINES = ENGINES + [
        (
            "E06",
            "06-engine-ensemble",
            "ensemble (per-field weighted)",
            "E06 — Ensemble combiner (per-field weighted majority)",
        )
    ]
ENGINE_COLORS = {
    "E00": "#7f7f7f",
    "E01": "#bcbd22",
    "E02": "#1f77b4",
    "E03": "#2ca02c",
    "E04": "#d62728",
    "E05": "#9467bd",
    "E06": "#ff7f0e",
    "E07": "#e377c2",
    "E08": "#17becf",
}

TOTAL_FIELDS_PER_SAMPLE = 74  # SDPR template schema size

# Fields that appear in GT for some samples but are not part of the engine schema
# (no engine returns a prediction for them). Excluded from per-category aggregation
# to avoid inflating category sizes and means.
IGNORE_FIELDS = {"case_id"}


def classify_field(field: str) -> str:
    if field in IGNORE_FIELDS:
        return "_ignored"
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
    return "income_amounts"


def load_run(slug: str) -> dict:
    path = RESULTS_DIR / slug / "benchmark-run.json"
    with open(path) as f:
        return json.load(f)


def compute_total_matched(run: dict) -> tuple[int, int]:
    """Return (matched_total, processed_total) across all samples."""
    matched = 0
    processed = 0
    for s in run.get("perSampleResults", []):
        if s.get("sampleId") == "manifest":
            continue
        m = s.get("metrics") or {}
        matched += int(m.get("matchedFields", 0) or 0)
        # Use schema size; if missing GT length, fall back to TOTAL_FIELDS_PER_SAMPLE
        total = int(m.get("totalGroundTruthFields", TOTAL_FIELDS_PER_SAMPLE) or TOTAL_FIELDS_PER_SAMPLE)
        processed += total
    return matched, processed


def main() -> None:
    runs = {tag: load_run(slug) for tag, slug, _, _ in ENGINES}

    # ---- 1. Aggregate metrics
    agg_rows = []
    for tag, slug, short, full in ENGINES:
        m = runs[tag]["metrics"]
        matched_total, processed_total = compute_total_matched(runs[tag])
        field_acc = matched_total / processed_total if processed_total else 0.0
        agg_rows.append({
            "engine": tag,
            "label": short,
            "full_name": full,
            "f1_median": m.get("f1.median", 0),
            "f1_mean": m.get("f1.mean", 0),
            "precision_mean": m.get("precision.mean", 0),
            "recall_mean": m.get("recall.mean", 0),
            "matched_median": m.get("matchedFields.median", 0),
            "matched_total": matched_total,
            "processed_total": processed_total,
            "field_accuracy": field_acc,
            "fp_mean": m.get("falsePositives.mean", 0),
            "pass_rate": m.get("pass_rate", 0),  # kept in CSV for reference, not plotted
        })
    with open(DATA_DIR / "aggregate-metrics.csv", "w") as f:
        w = csv.DictWriter(f, fieldnames=list(agg_rows[0].keys()))
        w.writeheader()
        w.writerows(agg_rows)

    # ---- 2. Plot: overall metrics bar chart (no pass_rate; tighter ylim)
    metric_names = ["f1_median", "f1_mean", "precision_mean", "recall_mean", "field_accuracy"]
    metric_labels = [
        "F1 (median)",
        "F1 (mean)",
        "Precision (mean)",
        "Recall (mean)",
        "Field accuracy\n(matched / processed)",
    ]
    fig, ax = plt.subplots(figsize=(13, 6))
    x = np.arange(len(metric_names))
    n_eng = len(ENGINES)
    bar_w = 0.85 / n_eng
    offset_start = -(n_eng - 1) / 2 * bar_w
    # Determine ylim based on minimum value across all engines/metrics
    all_vals = []
    for r in agg_rows:
        for m in metric_names:
            all_vals.append(r[m])
    ymin = max(0.0, min(all_vals) - 0.05)
    ymin = max(0.5, ymin)  # don't go below 0.5; differences are above 0.85 for most
    for i, (tag, _, short, full) in enumerate(ENGINES):
        vals = [next(r for r in agg_rows if r["engine"] == tag)[m] for m in metric_names]
        bars = ax.bar(x + offset_start + i * bar_w, vals, bar_w, label=full, color=ENGINE_COLORS[tag])
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.003, f"{v:.3f}",
                    ha="center", va="bottom", fontsize=6, rotation=0)
    ax.set_xticks(x)
    ax.set_xticklabels(metric_labels)
    ax.set_ylim(ymin, 1.01)
    ax.set_ylabel("score (0–1)")
    ax.set_title("Aggregate metrics by engine — strict eval, cleaned GT")
    ax.legend(loc="lower left", fontsize=8, ncol=2 if n_eng > 4 else 1)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "01-aggregate-metrics.png", dpi=140)
    plt.close(fig)

    # ---- 3. Per-sample f1 collection
    per_sample = {}
    sample_ids = None
    for tag, _, _, _ in ENGINES:
        samples = runs[tag]["perSampleResults"]
        d = {}
        for s in samples:
            if s.get("sampleId") == "manifest":
                continue
            d[s["sampleId"]] = (s.get("metrics") or {}).get("f1", 0.0) or 0.0
        per_sample[tag] = d
        if sample_ids is None:
            sample_ids = sorted(d.keys())

    # ---- 4. Plot: box plot with full-name legend
    fig, ax = plt.subplots(figsize=(10, 6))
    data = [list(per_sample[tag].values()) for tag, _, _, _ in ENGINES]
    bp = ax.boxplot(
        data,
        tick_labels=[t for t, _, _, _ in ENGINES],
        patch_artist=True,
        widths=0.6,
        showmeans=True,
        meanprops={"marker": "D", "markerfacecolor": "white",
                   "markeredgecolor": "black", "markersize": 6},
    )
    for patch, (tag, _, _, _) in zip(bp["boxes"], ENGINES):
        patch.set_facecolor(ENGINE_COLORS[tag])
        patch.set_alpha(0.6)
    # Add a legend using proxy artists (full engine names)
    from matplotlib.patches import Patch
    legend_handles = [
        Patch(facecolor=ENGINE_COLORS[tag], alpha=0.6, label=full)
        for tag, _, _, full in ENGINES
    ]
    ax.legend(handles=legend_handles, loc="lower left", fontsize=8)
    ax.set_ylabel("per-sample F1 score")
    ax.set_xlabel("engine")
    ax.set_title("Per-sample F1 distribution across 40 samples (strict eval)")
    ax.set_ylim(0.45, 1.02)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "02-per-sample-f1-distribution.png", dpi=140)
    plt.close(fig)

    # ---- 5. Per-field accuracy
    # Schema note: older exports use "field", newer exports use "name". Accept both.
    per_field = defaultdict(dict)
    all_fields: set[str] = set()
    for tag, _, _, _ in ENGINES:
        for pf in runs[tag].get("perFieldResults", []):
            field = pf.get("field") or pf.get("name")
            if not field:
                continue
            per_field[field][tag] = pf.get("accuracy", 0.0)
            all_fields.add(field)
    sorted_fields = sorted(all_fields, key=lambda f: (classify_field(f), f))

    with open(DATA_DIR / "per-field-accuracy.csv", "w") as f:
        w = csv.writer(f)
        w.writerow(["field", "category"] + [tag for tag, _, _, _ in ENGINES])
        for field in sorted_fields:
            w.writerow(
                [field, classify_field(field)]
                + [f"{per_field[field].get(tag, 0):.4f}" for tag, _, _, _ in ENGINES]
            )

    # ---- 6. Per-category accuracy
    cat_field_lists: dict[str, list[str]] = defaultdict(list)
    for f in sorted_fields:
        cat = classify_field(f)
        if cat == "_ignored":
            continue
        cat_field_lists[cat].append(f)

    per_category: dict[str, dict[str, float]] = {}
    for cat, fields_in_cat in cat_field_lists.items():
        d: dict[str, float] = {}
        for tag, _, _, _ in ENGINES:
            vals = [per_field[f].get(tag, 0.0) for f in fields_in_cat]
            d[tag] = float(np.mean(vals)) if vals else 0.0
        per_category[cat] = d

    with open(DATA_DIR / "per-category-accuracy.csv", "w") as f:
        w = csv.writer(f)
        w.writerow(["category", "n_fields"] + [tag for tag, _, _, _ in ENGINES])
        for cat in sorted(per_category.keys()):
            w.writerow(
                [cat, len(cat_field_lists[cat])]
                + [f"{per_category[cat][tag]:.4f}" for tag, _, _, _ in ENGINES]
            )

    # ---- 7. Plot: per-category accuracy bar chart, stretched ylim
    cat_order = [
        "sin", "date", "phone", "name", "signature", "freeform_text",
        "checkboxes", "income_amounts",
    ]
    cat_order = [c for c in cat_order if c in per_category]
    fig, ax = plt.subplots(figsize=(13, 6))
    x = np.arange(len(cat_order))
    bar_w = 0.85 / len(ENGINES)
    offset_start = -(len(ENGINES) - 1) / 2 * bar_w
    # Pick a tighter ylim based on the minimum value seen, but never above 0.4
    min_cat = min(per_category[c][tag] for c in cat_order for tag, _, _, _ in ENGINES)
    ymin = max(0.4, min_cat - 0.05)
    for i, (tag, _, _, full) in enumerate(ENGINES):
        vals = [per_category[c][tag] for c in cat_order]
        ax.bar(x + offset_start + i * bar_w, vals, bar_w,
               label=full, color=ENGINE_COLORS[tag])
    ax.set_xticks(x)
    ax.set_xticklabels([
        f"{c}\n({len(cat_field_lists[c])} fields)" for c in cat_order
    ])
    ax.set_ylim(ymin, 1.02)
    ax.set_ylabel("field accuracy (mean over fields in category)")
    ax.set_title("Per-category field accuracy by engine — strict eval, cleaned GT")
    ax.legend(loc="lower left", fontsize=8, ncol=2 if len(ENGINES) > 4 else 1)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "03-per-category-accuracy.png", dpi=140)
    plt.close(fig)

    # ---- 8. Plot: per-field heatmap (sort by category then accuracy)
    field_order = []
    for cat in cat_order:
        fs = sorted(
            cat_field_lists[cat],
            key=lambda f: -float(np.mean([per_field[f].get(t, 0) for t, _, _, _ in ENGINES])),
        )
        field_order.extend(fs)
    mat = np.array([
        [per_field[f].get(tag, 0.0) for tag, _, _, _ in ENGINES]
        for f in field_order
    ])
    fig, ax = plt.subplots(figsize=(9, max(8, 0.18 * len(field_order))))
    im = ax.imshow(mat, aspect="auto", cmap="RdYlGn", vmin=0.4, vmax=1.0)
    ax.set_xticks(range(len(ENGINES)))
    ax.set_xticklabels([t for t, _, _, _ in ENGINES])
    ax.set_yticks(range(len(field_order)))
    ax.set_yticklabels(field_order, fontsize=7)
    ax.set_title("Per-field accuracy heatmap (74 fields × engines)")
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

    # ---- 9. Best engine per field (for ensemble combiner)
    best_per_field = []
    for field in sorted_fields:
        scores = {tag: per_field[field].get(tag, 0.0) for tag, _, _, _ in ENGINES}
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

    # ---- 10. Plot: per-sample heatmap (replaces grouped bars)
    # Sort samples by mean f1 across engines (hardest at top)
    sids_sorted = sorted(
        sample_ids,
        key=lambda s: np.mean([per_sample[tag][s] for tag, _, _, _ in ENGINES]),
    )
    sample_mat = np.array([
        [per_sample[tag][s] for tag, _, _, _ in ENGINES]
        for s in sids_sorted
    ])
    fig, ax = plt.subplots(figsize=(9, max(10, 0.28 * len(sids_sorted))))
    im = ax.imshow(sample_mat, aspect="auto", cmap="RdYlGn", vmin=0.5, vmax=1.0)
    ax.set_xticks(range(len(ENGINES)))
    ax.set_xticklabels([t for t, _, _, _ in ENGINES], fontsize=10)
    ax.set_yticks(range(len(sids_sorted)))
    ax.set_yticklabels(sids_sorted, fontsize=8)
    ax.set_title("Per-sample F1 heatmap (40 samples × engines)\nsamples sorted hardest→easiest (mean F1 ascending)")
    ax.set_xlabel("engine")
    # Annotate cells with F1 values
    for i in range(sample_mat.shape[0]):
        for j in range(sample_mat.shape[1]):
            v = sample_mat[i, j]
            color = "white" if v < 0.78 else "black"
            ax.text(j, i, f"{v:.2f}", ha="center", va="center",
                    fontsize=6.5, color=color)
    plt.colorbar(im, ax=ax, label="F1 score")
    fig.tight_layout()
    fig.savefig(PLOTS_DIR / "05-per-sample-heatmap.png", dpi=140)
    plt.close(fig)

    # Remove the old grouped-bars chart if it exists from a previous run.
    old = PLOTS_DIR / "05-per-sample-f1-grouped.png"
    if old.exists():
        old.unlink()

    # ---- Console summary
    print("\n== Aggregate metrics ==")
    for r in agg_rows:
        print(
            f"  {r['engine']} ({r['label']:34s}) "
            f"f1.median={r['f1_median']:.3f} f1.mean={r['f1_mean']:.3f} "
            f"matched.median={int(r['matched_median'])} fp.mean={r['fp_mean']:.3f}  "
            f"field_acc={r['field_accuracy']:.3f} ({r['matched_total']}/{r['processed_total']})"
        )
    print("\n== Per-category accuracy (mean over fields in category) ==")
    header = f"  {'category':18s}" + "".join(f"  {tag:>6s}" for tag, _, _, _ in ENGINES) + "  best_engine"
    print(header)
    for cat in cat_order:
        row = f"  {cat:18s}"
        scores = per_category[cat]
        max_s = max(scores.values())
        best = [t for t, s in scores.items() if s == max_s]
        for tag, _, _, _ in ENGINES:
            mark = "*" if tag in best else " "
            row += f" {mark}{scores[tag]:5.3f}"
        row += f"   {','.join(best)} ({max_s:.3f})"
        print(row)

    print(f"\n✓ Wrote outputs to {OUT_DIR}")


if __name__ == "__main__":
    main()
