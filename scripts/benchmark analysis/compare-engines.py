#!/usr/bin/env python3
"""
Multi-engine benchmark comparison for the SDPR benchmark format.

Reads two or more benchmark JSON files (the same shape `analyze.js` consumes),
classifies the 75 SDPR fields into 8 categories, and emits:

  - aggregate-metrics.csv / .png   — accuracy / precision / recall / F1 per engine
  - error-class-breakdown.csv / .png — missing / extra / wrong split per engine
  - per-category-accuracy.csv / .png — field accuracy per category per engine
  - per-field-results.csv          — per-field error counts and rates per engine
  - per-field-heatmap.png          — 75-row heatmap, fields × engines, colour = error rate
  - threshold-sweep.csv / .png      — per-engine per-category confidence-gate trade-off
                                       (log-scale X axis so categories with very different
                                       prediction counts stay comparable)

CSVs are written so the markdown report can reference exact numbers without
re-reading the JSONs.

Usage:
    python compare-engines.py \\
        "Template (V1)=/path/to/template.json" \\
        "Neural (V2)=/path/to/neural.json" \\
        --out-dir /path/to/output/dir \\
        [--docs-count 99]

The labels become the engine column headers in the CSV / chart legends. Order
matters — it controls the visual ordering in tables and chart legends.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import dataclass, field as dc_field
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# Field categorisation. Mirrors the local cross-engine report's 8 categories.
# Any field that isn't a SIN / phone / date / name / signature / freeform /
# checkbox / case_id falls into income_amounts (the applicant_* and the
# spouse_* income lines).
# ---------------------------------------------------------------------------

CATEGORY_ORDER = [
    "sin",
    "date",
    "phone",
    "name",
    "signature",
    "freeform_text",
    "case_id",
    "checkboxes",
    "income_amounts",
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
    # Everything else is an income amount (applicant_* and the spouse_* income
    # lines that aren't covered above).
    return "income_amounts"


# ---------------------------------------------------------------------------
# Data shapes parsed out of the benchmark JSON.
# ---------------------------------------------------------------------------


@dataclass
class Prediction:
    field: str
    category: str
    confidence: float | None
    matched: bool
    sample_id: str
    predicted_is_empty: bool  # the model returned null / empty for this prediction
    expected_is_empty: bool   # ground truth is null / empty for this prediction


@dataclass
class FieldStats:
    name: str
    category: str
    evaluated: int
    correct: int
    errors: int
    missing: int
    extra: int
    wrong: int


@dataclass
class Engine:
    label: str
    docs_count: int
    predictions: list[Prediction] = dc_field(default_factory=list)
    field_stats: dict[str, FieldStats] = dc_field(default_factory=dict)

    @property
    def total_evaluated(self) -> int:
        return sum(f.evaluated for f in self.field_stats.values())

    @property
    def total_correct(self) -> int:
        return sum(f.correct for f in self.field_stats.values())

    @property
    def total_errors(self) -> int:
        return sum(f.errors for f in self.field_stats.values())

    @property
    def total_missing(self) -> int:
        return sum(f.missing for f in self.field_stats.values())

    @property
    def total_extra(self) -> int:
        return sum(f.extra for f in self.field_stats.values())

    @property
    def total_wrong(self) -> int:
        return sum(f.wrong for f in self.field_stats.values())


def is_empty(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return v.strip() == ""
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


def classify_error(expected, predicted) -> str:
    exp_empty = is_empty(expected)
    pred_empty = is_empty(predicted)
    if not exp_empty and pred_empty:
        return "missing"
    if exp_empty and not pred_empty:
        return "extra"
    return "wrong"


def load_engine(label: str, path: Path, docs_count: int) -> Engine:
    raw = json.loads(path.read_text("utf-8"))
    eng = Engine(label=label, docs_count=docs_count)

    # Per-sample predictions (every instance, with confidence + matched flag).
    # Whether `predicted` is empty drives the realistic HITL workload metric:
    # the operator skips fields the model returned blank for, only reviews
    # fields where the model produced a value (extras + wrongs are catchable;
    # missing errors require a different validation layer).
    for sample in raw.get("perSampleResults") or []:
        sample_id = sample.get("sampleId", "?")
        for det in sample.get("evaluationDetails") or []:
            name = det.get("field")
            if not isinstance(name, str):
                continue
            conf = det.get("confidence")
            if not isinstance(conf, (int, float)):
                conf = None
            # `predicted` may be absent from the dict (treat as empty) or
            # present with an empty value.
            pred_empty = "predicted" not in det or is_empty(det.get("predicted"))
            exp_empty = is_empty(det.get("expected"))
            eng.predictions.append(
                Prediction(
                    field=name,
                    category=classify_field(name),
                    confidence=float(conf) if conf is not None else None,
                    matched=det.get("matched") is True,
                    sample_id=sample_id,
                    predicted_is_empty=pred_empty,
                    expected_is_empty=exp_empty,
                )
            )

    # Per-field results (totals + error breakdown via errors[].expected/predicted).
    for f in raw.get("perFieldResults") or []:
        name = f.get("name")
        if not isinstance(name, str):
            continue
        missing = extra = wrong = 0
        for e in f.get("errors") or []:
            kind = classify_error(e.get("expected"), e.get("predicted"))
            if kind == "missing":
                missing += 1
            elif kind == "extra":
                extra += 1
            else:
                wrong += 1
        eng.field_stats[name] = FieldStats(
            name=name,
            category=classify_field(name),
            evaluated=int(f.get("evaluatedCount", 0)),
            correct=int(f.get("correctCount", 0)),
            errors=int(f.get("errorCount", 0)),
            missing=missing,
            extra=extra,
            wrong=wrong,
        )
    return eng


# ---------------------------------------------------------------------------
# Aggregate metric derivations. We don't have F1 / precision / recall pre-
# computed in the SDPR benchmark JSON (unlike the local cross-engine report),
# so derive them from the missing/extra/wrong counts using the standard
# definitions (a substitution / "wrong" is an FP and an FN simultaneously).
# ---------------------------------------------------------------------------


def aggregate_metrics(eng: Engine) -> dict[str, float]:
    tp = eng.total_correct
    fp = eng.total_extra + eng.total_wrong
    fn = eng.total_missing + eng.total_wrong
    accuracy = tp / eng.total_evaluated if eng.total_evaluated else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    fp_per_sample = fp / eng.docs_count if eng.docs_count else 0.0
    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "fp_per_sample": fp_per_sample,
        "total_correct": tp,
        "total_errors": eng.total_errors,
        "fields_total": len(eng.field_stats),
    }


def per_category_accuracy(eng: Engine) -> dict[str, tuple[int, int, int, float]]:
    """category → (n_fields, evaluated, correct, accuracy)"""
    out: dict[str, list[FieldStats]] = {c: [] for c in CATEGORY_ORDER}
    for fs in eng.field_stats.values():
        out.setdefault(fs.category, []).append(fs)
    rows: dict[str, tuple[int, int, int, float]] = {}
    for cat, fields in out.items():
        if not fields:
            continue
        ev = sum(f.evaluated for f in fields)
        co = sum(f.correct for f in fields)
        acc = co / ev if ev else 0.0
        rows[cat] = (len(fields), ev, co, acc)
    return rows


# ---------------------------------------------------------------------------
# Threshold-sweep computation. Gate semantics match analyze.js / the backend:
# flagged := confidence < threshold. So a prediction with conf 0.78 is flagged
# at threshold 0.80 (sent to HITL).
# ---------------------------------------------------------------------------

THRESHOLDS = [0.50, 0.70, 0.80, 0.90, 0.95, 0.99]
RECOMMENDED_RECALL = 0.90  # the "catch 90% of errors" objective per category


def sweep_thresholds(
    preds: list[Prediction], thresholds: list[float], docs_count: int
) -> list[dict]:
    """Per-threshold trade-off. Models the realistic HITL strategy: the
    operator reviews predictions that (a) are below the confidence threshold
    AND (b) have a non-blank predicted value. Predictions where the model
    correctly said "blank" are skipped (the model said nothing, so there's
    nothing to verify). The cost is that `missing` errors — where the model
    said blank but the ground truth had a value — are uncatchable by this
    strategy and would need a different validation layer.

    Each row reports both views so the table stays self-documenting:
    - `non_blank_flagged_per_100_docs` and `recall` use the realistic strategy
      (skip-blank), and `recall` is computed against ALL errors so the per-
      category ceiling is visible (recall < 1.0 means missings are escaping).
    - `all_flagged_per_100_docs` is the upper-bound conservative view
      (review every low-confidence prediction including correctly-blank ones).
    """
    rated = [p for p in preds if p.confidence is not None]
    total = len(rated)
    errors_total = sum(1 for p in rated if not p.matched)
    # Errors the skip-blank strategy can catch: anything where the model
    # produced a value (extras and wrongs). It cannot catch `missing` errors
    # because the operator skips blank predictions.
    catchable_errors = sum(1 for p in rated if not p.matched and not p.predicted_is_empty)
    rows = []
    for t in thresholds:
        flagged_all = [p for p in rated if p.confidence < t]
        flagged_non_blank = [p for p in flagged_all if not p.predicted_is_empty]
        errors_caught_non_blank = sum(1 for p in flagged_non_blank if not p.matched)
        rows.append(
            {
                "threshold": t,
                # Skip-blank (realistic) view
                "errors_caught": errors_caught_non_blank,
                "errors_total": errors_total,
                "catchable_errors": catchable_errors,
                "non_blank_flagged": len(flagged_non_blank),
                "non_blank_flagged_per_100_docs": (
                    len(flagged_non_blank) * 100 / docs_count if docs_count else 0.0
                ),
                "recall": errors_caught_non_blank / errors_total if errors_total else 0.0,
                # Conservative (review-everything) view, kept for reference
                "all_flagged": len(flagged_all),
                "all_flagged_per_100_docs": (
                    len(flagged_all) * 100 / docs_count if docs_count else 0.0
                ),
                "predictions_total": total,
            }
        )
    return rows


def recommended_threshold(
    preds: list[Prediction], target_recall: float, docs_count: int
) -> dict | None:
    """Smallest threshold under the skip-blank HITL strategy that catches
    `target_recall` of all errors. Returns None for low-signal categories
    (<5 errors).

    If the ceiling on catchable errors is below `target_recall` (i.e., too
    many `missing` errors to ever hit the target via confidence-gating
    alone), returns the threshold that achieves the ceiling and marks the
    row as `recall_ceiling_limited`. The narrative in the report needs to
    explain that ceiling-limited categories need a second validation layer
    (sanity rules, ICM cross-validation) for missings."""
    rated = [p for p in preds if p.confidence is not None]
    errors = [p for p in rated if not p.matched]
    if len(errors) < 5:
        return None
    catchable = [p for p in errors if not p.predicted_is_empty]
    catchable_n = len(catchable)
    total_n = len(errors)
    ceiling = catchable_n / total_n if total_n else 0.0

    if catchable_n == 0:
        # Pathological: every error is a missing error. Confidence-gating
        # cannot help at all on this category.
        return {
            "threshold": None,
            "errors_caught": 0,
            "errors_total": total_n,
            "catchable_errors": 0,
            "predictions_flagged": 0,
            "predictions_total": len(rated),
            "flagged_per_100_docs": 0.0,
            "recall": 0.0,
            "recall_ceiling": 0.0,
            "ceiling_limited": True,
        }

    # If the ceiling allows hitting the target, find the smallest threshold
    # that does. Otherwise aim for the ceiling.
    effective_target_count = (
        int(np.ceil(total_n * target_recall))
        if ceiling >= target_recall
        else catchable_n
    )
    # Sort catchable errors by confidence; the (k-1)-th smallest confidence
    # is the highest we must flag.
    sorted_conf = sorted(p.confidence for p in catchable)
    cutoff_idx = min(effective_target_count - 1, catchable_n - 1)
    cutoff = sorted_conf[cutoff_idx]
    t = (np.ceil((cutoff + 1e-9) / 0.01) * 0.01).item()
    t = round(t, 2)
    flagged_non_blank = [
        p for p in rated if p.confidence < t and not p.predicted_is_empty
    ]
    errors_caught = sum(1 for p in flagged_non_blank if not p.matched)
    return {
        "threshold": t,
        "errors_caught": errors_caught,
        "errors_total": total_n,
        "catchable_errors": catchable_n,
        "predictions_flagged": len(flagged_non_blank),
        "predictions_total": len(rated),
        "flagged_per_100_docs": (
            len(flagged_non_blank) * 100 / docs_count if docs_count else 0.0
        ),
        "recall": errors_caught / total_n if total_n else 0.0,
        "recall_ceiling": ceiling,
        "ceiling_limited": ceiling < target_recall,
    }


def predictions_by_category(eng: Engine) -> dict[str, list[Prediction]]:
    out: dict[str, list[Prediction]] = {c: [] for c in CATEGORY_ORDER}
    for p in eng.predictions:
        out.setdefault(p.category, []).append(p)
    return out


# ---------------------------------------------------------------------------
# CSV writers.
# ---------------------------------------------------------------------------


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def write_aggregate_csv(engines: list[Engine], out_dir: Path) -> None:
    metrics = ["accuracy", "precision", "recall", "f1", "fp_per_sample"]
    rows = [["metric"] + [e.label for e in engines]]
    agg = {e.label: aggregate_metrics(e) for e in engines}
    for m in metrics:
        rows.append([m] + [f"{agg[e.label][m]:.4f}" for e in engines])
    write_csv(out_dir / "aggregate-metrics.csv", rows[0], rows[1:])


def write_error_class_csv(engines: list[Engine], out_dir: Path) -> None:
    header = ["class"] + [e.label for e in engines]
    rows = []
    for cls in ("missing", "extra", "wrong", "total"):
        row = [cls]
        for e in engines:
            if cls == "missing":
                row.append(e.total_missing)
            elif cls == "extra":
                row.append(e.total_extra)
            elif cls == "wrong":
                row.append(e.total_wrong)
            else:
                row.append(e.total_errors)
        rows.append(row)
    write_csv(out_dir / "error-class-breakdown.csv", header, rows)


def write_per_category_csv(engines: list[Engine], out_dir: Path) -> None:
    header = ["category", "n_fields"] + [e.label for e in engines]
    per_eng = {e.label: per_category_accuracy(e) for e in engines}
    rows = []
    for cat in CATEGORY_ORDER:
        present = any(cat in per_eng[e.label] for e in engines)
        if not present:
            continue
        n_fields = next(
            per_eng[e.label][cat][0] for e in engines if cat in per_eng[e.label]
        )
        row = [cat, n_fields]
        for e in engines:
            if cat in per_eng[e.label]:
                row.append(f"{per_eng[e.label][cat][3]:.4f}")
            else:
                row.append("")
        rows.append(row)
    write_csv(out_dir / "per-category-accuracy.csv", header, rows)


def write_per_field_csv(engines: list[Engine], out_dir: Path) -> None:
    fields = sorted({n for e in engines for n in e.field_stats})
    header = ["field", "category"]
    for e in engines:
        header += [f"{e.label} errors", f"{e.label} error_rate"]
    rows = []
    for name in fields:
        cat = next((e.field_stats[name].category for e in engines if name in e.field_stats), "")
        row = [name, cat]
        for e in engines:
            fs = e.field_stats.get(name)
            if fs is None:
                row += ["", ""]
            else:
                row += [fs.errors, f"{(fs.errors / fs.evaluated):.4f}" if fs.evaluated else ""]
        rows.append(row)
    write_csv(out_dir / "per-field-results.csv", header, rows)


def write_threshold_sweep_csv(engines: list[Engine], out_dir: Path) -> None:
    header = [
        "engine",
        "category",
        "threshold",
        "errors_caught",
        "errors_total",
        "catchable_errors",
        "non_blank_flagged",
        "non_blank_flagged_per_100_docs",
        "all_flagged_per_100_docs",
        "predictions_total",
        "recall",
    ]
    rows = []
    for e in engines:
        by_cat = predictions_by_category(e)
        for cat in CATEGORY_ORDER:
            preds = by_cat.get(cat, [])
            if not preds:
                continue
            for row in sweep_thresholds(preds, THRESHOLDS, e.docs_count):
                rows.append(
                    [
                        e.label,
                        cat,
                        f"{row['threshold']:.2f}",
                        row["errors_caught"],
                        row["errors_total"],
                        row["catchable_errors"],
                        row["non_blank_flagged"],
                        f"{row['non_blank_flagged_per_100_docs']:.1f}",
                        f"{row['all_flagged_per_100_docs']:.1f}",
                        row["predictions_total"],
                        f"{row['recall']:.4f}",
                    ]
                )
    write_csv(out_dir / "threshold-sweep.csv", header, rows)


def write_recommended_csv(engines: list[Engine], out_dir: Path) -> None:
    header = [
        "engine",
        "category",
        "target_recall",
        "threshold",
        "errors_caught",
        "errors_total",
        "catchable_errors",
        "recall_ceiling",
        "non_blank_flagged",
        "flagged_per_100_docs",
        "note",
    ]
    rows = []
    for e in engines:
        by_cat = predictions_by_category(e)
        for cat in CATEGORY_ORDER:
            preds = by_cat.get(cat, [])
            if not preds:
                continue
            rec = recommended_threshold(preds, RECOMMENDED_RECALL, e.docs_count)
            if rec is None:
                errors_total = sum(1 for p in preds if not p.matched and p.confidence is not None)
                rows.append(
                    [
                        e.label,
                        cat,
                        f"{RECOMMENDED_RECALL:.2f}",
                        "",
                        "",
                        errors_total,
                        "",
                        "",
                        "",
                        "",
                        "low signal (<5 errors)",
                    ]
                )
            else:
                t_str = f"{rec['threshold']:.2f}" if rec["threshold"] is not None else ""
                note = ""
                if rec.get("ceiling_limited"):
                    note = (
                        f"ceiling-limited: missings make {(1 - rec['recall_ceiling']) * 100:.0f}% "
                        "of errors uncatchable by confidence-gating"
                    )
                rows.append(
                    [
                        e.label,
                        cat,
                        f"{RECOMMENDED_RECALL:.2f}",
                        t_str,
                        rec["errors_caught"],
                        rec["errors_total"],
                        rec["catchable_errors"],
                        f"{rec['recall_ceiling']:.4f}",
                        rec["predictions_flagged"],
                        f"{rec['flagged_per_100_docs']:.1f}",
                        note,
                    ]
                )
    write_csv(out_dir / "recommended-thresholds.csv", header, rows)


# ---------------------------------------------------------------------------
# Plots. Each plot prints to PNG only; the data is in the CSVs alongside.
# ---------------------------------------------------------------------------

ENGINE_COLOURS = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
]
CATEGORY_COLOURS = {
    "sin": "#1f77b4",
    "date": "#ff7f0e",
    "phone": "#2ca02c",
    "name": "#d62728",
    "signature": "#9467bd",
    "freeform_text": "#8c564b",
    "case_id": "#e377c2",
    "checkboxes": "#7f7f7f",
    "income_amounts": "#17becf",
}


def plot_aggregate_metrics(engines: list[Engine], out_dir: Path) -> None:
    metrics = [("accuracy", "Accuracy"), ("precision", "Precision"), ("recall", "Recall"), ("f1", "F1")]
    agg = {e.label: aggregate_metrics(e) for e in engines}
    x = np.arange(len(metrics))
    width = 0.8 / max(len(engines), 1)
    fig, ax = plt.subplots(figsize=(9, 5))
    for i, e in enumerate(engines):
        vals = [agg[e.label][m] for m, _ in metrics]
        bars = ax.bar(
            x + i * width - 0.4 + width / 2,
            vals,
            width,
            label=e.label,
            color=ENGINE_COLOURS[i % len(ENGINE_COLOURS)],
        )
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.005, f"{v:.3f}",
                    ha="center", va="bottom", fontsize=8)
    ax.set_xticks(x)
    ax.set_xticklabels([lbl for _, lbl in metrics])
    ax.set_ylim(min(min(agg[e.label][m] for m, _ in metrics for e in engines) - 0.05, 0.7), 1.0)
    ax.set_ylabel("Score (0–1)")
    ax.set_title("Aggregate accuracy metrics")
    ax.legend(loc="lower right")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_dir / "01-aggregate-metrics.png", dpi=150)
    plt.close(fig)


def plot_error_class_breakdown(engines: list[Engine], out_dir: Path) -> None:
    classes = ["missing", "extra", "wrong"]
    class_colours = {"missing": "#ff7f0e", "extra": "#d62728", "wrong": "#9467bd"}
    fig, ax = plt.subplots(figsize=(8, 5))
    x = np.arange(len(engines))
    bottoms = np.zeros(len(engines))
    for cls in classes:
        vals = [getattr(e, f"total_{cls}") for e in engines]
        bars = ax.bar(x, vals, label=cls, color=class_colours[cls], bottom=bottoms)
        for b, v, bot in zip(bars, vals, bottoms):
            if v > 0:
                ax.text(b.get_x() + b.get_width() / 2, bot + v / 2, str(v),
                        ha="center", va="center", fontsize=9, color="white", weight="bold")
        bottoms += np.array(vals)
    # Total label above each bar.
    for i, e in enumerate(engines):
        ax.text(x[i], bottoms[i] + max(bottoms) * 0.01, f"total {e.total_errors}",
                ha="center", va="bottom", fontsize=9, weight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels([e.label for e in engines])
    ax.set_ylabel("Errors")
    ax.set_title("Error-class breakdown (missing / extra / wrong)")
    ax.legend(loc="upper right")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_dir / "02-error-class-breakdown.png", dpi=150)
    plt.close(fig)


def plot_per_category_accuracy(engines: list[Engine], out_dir: Path) -> None:
    per_eng = {e.label: per_category_accuracy(e) for e in engines}
    cats = [c for c in CATEGORY_ORDER if any(c in per_eng[e.label] for e in engines)]
    x = np.arange(len(cats))
    width = 0.8 / max(len(engines), 1)
    fig, ax = plt.subplots(figsize=(11, 5))
    all_vals = []
    for i, e in enumerate(engines):
        vals = [per_eng[e.label].get(c, (0, 0, 0, 0))[3] for c in cats]
        all_vals.extend(vals)
        bars = ax.bar(
            x + i * width - 0.4 + width / 2,
            vals,
            width,
            label=e.label,
            color=ENGINE_COLOURS[i % len(ENGINE_COLOURS)],
        )
        for b, v in zip(bars, vals):
            if v > 0:
                ax.text(b.get_x() + b.get_width() / 2, v + 0.005, f"{v:.2f}",
                        ha="center", va="bottom", fontsize=7)
    ax.set_xticks(x)
    ax.set_xticklabels([f"{c}\n({per_eng[engines[0].label].get(c, (0,))[0]} fields)" for c in cats], fontsize=9)
    ax.set_ylim(min(all_vals) - 0.05 if all_vals else 0, 1.02)
    ax.set_ylabel("Field accuracy")
    ax.set_title("Per-category field accuracy")
    ax.legend(loc="lower right")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_dir / "03-per-category-accuracy.png", dpi=150)
    plt.close(fig)


def plot_per_field_heatmap(engines: list[Engine], out_dir: Path) -> None:
    """Per-field error-rate heatmap. Fields on Y (grouped by category, sorted
    within each category by mean error rate descending so the worst rows
    are at the top of each group). Engines on X — one column per engine, in
    the CLI order. Cell text is the absolute error count; cell colour is the
    error rate (0 = green, 1 = red). Scales to any N engines by adding more
    columns; no restructuring needed when V3/V4 add Mistral / CU / etc."""
    # Collect every field with stats in at least one engine. Group by category
    # and sort within each by mean error rate across engines.
    all_fields = sorted({n for e in engines for n in e.field_stats})
    by_cat: dict[str, list[str]] = {c: [] for c in CATEGORY_ORDER}
    for name in all_fields:
        cat = next((e.field_stats[name].category for e in engines if name in e.field_stats), None)
        if cat is None:
            continue
        by_cat.setdefault(cat, []).append(name)
    for cat, names in by_cat.items():
        names.sort(
            key=lambda n: -np.mean([
                (e.field_stats[n].errors / e.field_stats[n].evaluated)
                if (n in e.field_stats and e.field_stats[n].evaluated) else 0.0
                for e in engines
            ])
        )

    # Final row order = concatenation of category groups, in CATEGORY_ORDER.
    ordered_fields: list[str] = []
    category_boundaries: list[int] = []  # row indices where each new category starts
    category_labels: list[tuple[int, int, str]] = []  # (start, end, name)
    cursor = 0
    for cat in CATEGORY_ORDER:
        names = by_cat.get(cat, [])
        if not names:
            continue
        if ordered_fields:
            category_boundaries.append(cursor)
        category_labels.append((cursor, cursor + len(names), cat))
        ordered_fields.extend(names)
        cursor += len(names)

    if not ordered_fields:
        return

    # Build the data matrix: rows × columns = fields × engines.
    rates = np.full((len(ordered_fields), len(engines)), np.nan)
    counts = [[("", "") for _ in engines] for _ in ordered_fields]
    for r, name in enumerate(ordered_fields):
        for c, e in enumerate(engines):
            fs = e.field_stats.get(name)
            if fs is None or fs.evaluated == 0:
                continue
            rate = fs.errors / fs.evaluated
            rates[r, c] = rate
            counts[r][c] = (str(fs.errors), str(fs.evaluated))

    row_h = max(0.18, min(0.28, 11.0 / len(ordered_fields)))
    fig_h = max(8.0, row_h * len(ordered_fields) + 2)
    col_w = 1.6
    fig_w = max(7.0, 2.5 + col_w * len(engines))
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    cmap = plt.get_cmap("RdYlGn_r")
    im = ax.imshow(
        rates,
        cmap=cmap,
        vmin=0.0,
        vmax=1.0,
        aspect="auto",
        interpolation="nearest",
    )

    # Cell text: "errors/total" (e.g. "30/99"). Use white text on dark cells
    # for readability.
    for r in range(len(ordered_fields)):
        for c in range(len(engines)):
            if np.isnan(rates[r, c]):
                continue
            errs, evals = counts[r][c]
            cell_text = f"{errs}/{evals}"
            colour = "white" if rates[r, c] > 0.55 else "black"
            ax.text(c, r, cell_text, ha="center", va="center", fontsize=7, color=colour)

    # Y-axis: field names. X-axis: engine labels.
    ax.set_yticks(range(len(ordered_fields)))
    ax.set_yticklabels(ordered_fields, fontsize=7)
    ax.set_xticks(range(len(engines)))
    ax.set_xticklabels([e.label for e in engines], fontsize=10, rotation=0)

    # Category boundary lines + side annotations on the right edge. Use a
    # bottom-mounted horizontal colorbar so the right side stays clear for
    # the category labels (otherwise they collide with a vertical colorbar).
    for boundary in category_boundaries:
        ax.axhline(boundary - 0.5, color="black", linewidth=1.2)
    for start, end, cat in category_labels:
        ax.annotate(
            cat,
            xy=(1.02, 1 - (start + end - 1) / 2 / len(ordered_fields)),
            xycoords="axes fraction",
            ha="left",
            va="center",
            fontsize=9,
            weight="bold",
            annotation_clip=False,
        )

    cbar = fig.colorbar(im, ax=ax, orientation="horizontal", fraction=0.04, pad=0.05, aspect=40)
    cbar.set_label("Error rate (0 = perfect, 1 = all wrong)", fontsize=9)
    ax.set_title("Per-field error rates — fields × engines\n(cell text: errors / total evaluations)", fontsize=11)
    fig.tight_layout()
    fig.savefig(out_dir / "04-per-field-heatmap.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_threshold_sweep(engines: list[Engine], out_dir: Path) -> None:
    """One subplot per engine. X = predictions flagged per 100 docs (the HITL
    workload). Y = errors caught (%). One line per category."""
    n = len(engines)
    fig, axes = plt.subplots(1, n, figsize=(7 * n, 6), sharey=True)
    if n == 1:
        axes = [axes]
    # Line sampling step matches the recommended-threshold rounding step
    # (0.01) so the dot for each category lands exactly on its curve.
    fine_thresholds = [round(x, 2) for x in np.arange(0.0, 1.001, 0.01)]
    for ax, e in zip(axes, engines):
        by_cat = predictions_by_category(e)
        for cat in CATEGORY_ORDER:
            preds = by_cat.get(cat, [])
            if not preds:
                continue
            errs = sum(1 for p in preds if not p.matched and p.confidence is not None)
            if errs < 5:
                continue
            rows = sweep_thresholds(preds, fine_thresholds, e.docs_count)
            xs = [r["non_blank_flagged_per_100_docs"] for r in rows]
            ys = [r["recall"] * 100 for r in rows]
            ceiling = rows[-1]["catchable_errors"] / rows[-1]["errors_total"] * 100 if rows[-1]["errors_total"] else 100
            # The recommended-threshold dot goes on the curve; its threshold
            # value, HITL load, and ceiling status are surfaced in the legend.
            rec = recommended_threshold(preds, RECOMMENDED_RECALL, e.docs_count)
            if rec is None:
                legend_label = f"{cat} ({errs} err)"
            else:
                if rec.get("ceiling_limited"):
                    legend_label = (
                        f"{cat} ({errs} err) — T={rec['threshold']:.2f}, "
                        f"{rec['flagged_per_100_docs']:.0f}/100 → {rec['recall'] * 100:.0f}% "
                        f"(ceiling — missings cap recall)"
                    )
                else:
                    legend_label = (
                        f"{cat} ({errs} err) — T={rec['threshold']:.2f}, "
                        f"{rec['flagged_per_100_docs']:.0f}/100 → {rec['recall'] * 100:.0f}%"
                    )
            line_style = "--" if rec is not None and rec.get("ceiling_limited") else "-"
            ax.plot(xs, ys, label=legend_label,
                    color=CATEGORY_COLOURS.get(cat, "#333"),
                    linewidth=2, linestyle=line_style)
            if rec is not None and rec["threshold"] is not None:
                ax.scatter([rec["flagged_per_100_docs"]], [rec["recall"] * 100],
                           color=CATEGORY_COLOURS.get(cat, "#333"),
                           edgecolor="black", s=70, zorder=5)
        ax.set_xlabel("Non-blank predictions flagged per 100 documents (log scale)")
        if ax is axes[0]:
            ax.set_ylabel("Errors caught (%)")
        ax.set_title(e.label)
        ax.set_ylim(0, 102)
        ax.set_xscale("log")
        # Categories have wildly different prediction counts (signature: 2 fields
        # × 99 docs = 198 max; income_amounts: 35 × 99 = 3,465 max). Linear X
        # would bunch the small-count categories into the left edge; log keeps
        # them legible. Left limit of 1 keeps the axis from compressing the
        # interesting region.
        ax.set_xlim(left=1)
        ax.grid(alpha=0.3, which="both")
        ax.axhline(90, color="grey", linestyle=":", linewidth=1)
        ax.legend(loc="lower right", fontsize=8)
    fig.suptitle(
        "Confidence-threshold trade-off — HITL strategy: review flagged predictions where the model produced a value\n"
        "Dots = smallest T catching ≥90% of errors (or the ceiling, if lower). Dashed lines = ceiling-limited categories\n"
        "(too many `missing` errors — model said blank when GT had a value — to reach 90% by confidence-gating alone).",
        fontsize=10,
    )
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(out_dir / "05-threshold-sweep.png", dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Entrypoint.
# ---------------------------------------------------------------------------


def parse_engine_arg(s: str) -> tuple[str, Path]:
    if "=" not in s:
        raise argparse.ArgumentTypeError(
            f"engine arg must be LABEL=PATH (got {s!r})"
        )
    label, _, path = s.partition("=")
    label = label.strip()
    path = path.strip()
    if not label or not path:
        raise argparse.ArgumentTypeError(f"empty label or path in {s!r}")
    return label, Path(path)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "engines",
        nargs="+",
        type=parse_engine_arg,
        help='one or more LABEL=PATH pairs (e.g. "Template (V1)=/tmp/template.json")',
    )
    ap.add_argument("--out-dir", required=True, type=Path, help="directory for PNGs and CSVs")
    ap.add_argument("--docs-count", type=int, default=99,
                    help="number of documents in the benchmark sample (default 99)")
    args = ap.parse_args(argv)

    args.out_dir.mkdir(parents=True, exist_ok=True)

    engines: list[Engine] = []
    for label, path in args.engines:
        if not path.exists():
            print(f"error: file not found: {path}", file=sys.stderr)
            return 1
        engines.append(load_engine(label, path, args.docs_count))
        print(f"loaded {label}: {len(engines[-1].field_stats)} fields, "
              f"{engines[-1].total_evaluated} evaluations, "
              f"{len(engines[-1].predictions)} per-prediction records")

    # CSVs.
    write_aggregate_csv(engines, args.out_dir)
    write_error_class_csv(engines, args.out_dir)
    write_per_category_csv(engines, args.out_dir)
    write_per_field_csv(engines, args.out_dir)
    write_threshold_sweep_csv(engines, args.out_dir)
    write_recommended_csv(engines, args.out_dir)

    # Plots.
    plot_aggregate_metrics(engines, args.out_dir)
    plot_error_class_breakdown(engines, args.out_dir)
    plot_per_category_accuracy(engines, args.out_dir)
    plot_per_field_heatmap(engines, args.out_dir)
    plot_threshold_sweep(engines, args.out_dir)

    print(f"\nWrote outputs to {args.out_dir}/")
    print("  CSVs: aggregate-metrics, error-class-breakdown, per-category-accuracy,")
    print("        per-field-results, threshold-sweep, recommended-thresholds")
    print("  PNGs: 01-aggregate-metrics, 02-error-class-breakdown,")
    print("        03-per-category-accuracy, 04-per-field-heatmap,")
    print("        05-threshold-sweep")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
