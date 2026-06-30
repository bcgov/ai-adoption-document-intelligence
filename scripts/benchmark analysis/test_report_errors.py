"""Tests for report-errors.py — focused on the vs_baseline flag logic
and write_wrong_by_category_csv schema. Synthetic inputs only.
"""

from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "report_errors",
    Path(__file__).parent / "report-errors.py",
)
re_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(re_mod)  # type: ignore[union-attr]


# --- vs_baseline flag classification ---------------------------------------


class TestVsBaselineFlag:
    @pytest.mark.parametrize("target_kind", ["wrong", "missing", "extra"])
    def test_regression_when_baseline_matched(self, target_kind):
        assert re_mod._vs_baseline_flag(target_kind, "matched") == "regression"

    def test_new_cell_when_baseline_absent(self):
        assert re_mod._vs_baseline_flag("wrong", "absent") == "new-cell"

    @pytest.mark.parametrize("kind", ["wrong", "missing", "extra"])
    def test_same_kind_when_both_failed_same_way(self, kind):
        assert re_mod._vs_baseline_flag(kind, kind) == "same-kind"

    @pytest.mark.parametrize(
        "target_kind,baseline_kind",
        [
            ("wrong", "missing"),
            ("wrong", "extra"),
            ("missing", "wrong"),
            ("missing", "extra"),
            ("extra", "wrong"),
            ("extra", "missing"),
        ],
    )
    def test_drift_when_both_failed_different_ways(self, target_kind, baseline_kind):
        assert re_mod._vs_baseline_flag(target_kind, baseline_kind) == "drift"


# --- write_wrong_by_category_csv schema ------------------------------------


def _make_preds(rows):
    """Build the engine-preds dict shape that write_wrong_by_category_csv
    expects. Each row: (sampleId, field, kind, predicted, expected)."""
    out = {}
    for sid, field, kind, predicted, expected in rows:
        matched = kind == "matched"
        out[(sid, field)] = {
            "matched": matched,
            "predicted": predicted,
            "expected": expected,
            "confidence": 0.5,
            "kind": kind,
        }
    return out


class TestWrongByCategoryCSV:
    def test_single_engine_writes_seven_columns(self, tmp_path):
        target = _make_preds([
            ("s1", "name", "wrong", "Foo", "Bar"),
            ("s2", "name", "matched", "Bar", "Bar"),
        ])
        out = tmp_path / "out.csv"
        count = re_mod.write_wrong_by_category_csv("target", target, out)
        assert count == 1  # only the non-matched row
        with out.open() as f:
            reader = csv.reader(f)
            header = next(reader)
            assert header == [
                "sampleId", "category", "field", "kind",
                "predicted", "expected", "confidence",
            ]
            rows = list(reader)
            assert len(rows) == 1
            assert rows[0][0] == "s1"
            assert rows[0][3] == "wrong"

    def test_multi_engine_adds_three_baseline_columns(self, tmp_path):
        baseline = _make_preds([
            ("s1", "name", "matched", "Bar", "Bar"),
            ("s2", "name", "wrong", "Wrong1", "Bar"),
        ])
        target = _make_preds([
            ("s1", "name", "wrong", "Foo", "Bar"),
            ("s2", "name", "wrong", "Wrong2", "Bar"),
        ])
        out = tmp_path / "out.csv"
        count = re_mod.write_wrong_by_category_csv(
            "neural", target, out, baseline=("template", baseline),
        )
        assert count == 2
        with out.open() as f:
            reader = csv.DictReader(f)
            assert reader.fieldnames == [
                "sampleId", "category", "field", "kind",
                "predicted", "expected", "confidence",
                "baseline_kind", "baseline_predicted", "vs_baseline",
            ]
            rows = list(reader)
            # s1 row: baseline matched → vs_baseline = regression (top of file)
            assert rows[0]["sampleId"] == "s1"
            assert rows[0]["baseline_kind"] == "matched"
            assert rows[0]["baseline_predicted"] == "Bar"
            assert rows[0]["vs_baseline"] == "regression"
            # s2 row: baseline wrong, target wrong → same-kind (after regression)
            assert rows[1]["sampleId"] == "s2"
            assert rows[1]["baseline_kind"] == "wrong"
            assert rows[1]["baseline_predicted"] == "Wrong1"
            assert rows[1]["vs_baseline"] == "same-kind"

    def test_baseline_absent_yields_new_cell_flag(self, tmp_path):
        baseline = _make_preds([])  # empty: s1/name not present
        target = _make_preds([
            ("s1", "name", "wrong", "Foo", "Bar"),
        ])
        out = tmp_path / "out.csv"
        re_mod.write_wrong_by_category_csv(
            "neural", target, out, baseline=("template", baseline),
        )
        with out.open() as f:
            rows = list(csv.DictReader(f))
            assert rows[0]["baseline_kind"] == "absent"
            assert rows[0]["baseline_predicted"] == ""
            assert rows[0]["vs_baseline"] == "new-cell"

    def test_multi_engine_sort_regressions_first(self, tmp_path):
        baseline = _make_preds([
            ("s1", "name", "matched", "Bar", "Bar"),       # → regression
            ("s2", "name", "wrong", "X", "Bar"),           # → same-kind
            ("s3", "name", "missing", None, "Bar"),        # → drift (vs wrong)
        ])
        target = _make_preds([
            ("s1", "name", "wrong", "A", "Bar"),
            ("s2", "name", "wrong", "B", "Bar"),
            ("s3", "name", "wrong", "C", "Bar"),
        ])
        out = tmp_path / "out.csv"
        re_mod.write_wrong_by_category_csv(
            "neural", target, out, baseline=("template", baseline),
        )
        with out.open() as f:
            rows = list(csv.DictReader(f))
            # Expected order by vs_baseline rank: regression, drift, same-kind
            assert [r["vs_baseline"] for r in rows] == [
                "regression", "drift", "same-kind",
            ]

    def test_row_count_equals_non_matched_cells(self, tmp_path):
        target = _make_preds([
            ("s1", "name", "wrong", "A", "B"),
            ("s2", "name", "matched", "B", "B"),
            ("s3", "name", "missing", None, "B"),
            ("s4", "name", "extra", "X", None),
        ])
        out = tmp_path / "out.csv"
        count = re_mod.write_wrong_by_category_csv("target", target, out)
        # 3 non-matched (wrong, missing, extra); 1 matched excluded
        assert count == 3
