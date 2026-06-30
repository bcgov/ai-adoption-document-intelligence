"""Tests for normalize-benchmark.py — focused on the fuzzy rules added on
top of the existing equivalence ruleset. Synthetic inputs only; no share
data. The script's filename contains a hyphen so we load it via importlib.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "normalize_benchmark",
    Path(__file__).parent / "normalize-benchmark.py",
)
nb = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(nb)  # type: ignore[union-attr]


# --- helpers ---------------------------------------------------------------


def classify(field: str, predicted: str, expected: str):
    return nb.classify_format_variant(field, predicted, expected)


# --- name-fuzzy ------------------------------------------------------------


class TestNameFuzzy:
    @pytest.mark.parametrize(
        "predicted,expected",
        [
            ("Christophar", "Christopher"),       # 1 sub, 11 chars → 90.9
            ("Martinz", "Martinez"),              # 1 deletion → 93.3
            ("Brown-Smith", "BrownSmith"),        # hyphen drop → 95.2
            ("Christopher", "christophar"),       # case + sub → 90.9 after norm
            ("Martinez", "Martínez"),             # 1 sub, 8 chars → 87.5 (now flips at 80)
            ("Mackinnon", "Mackinnen"),           # 1 sub, 9 chars → 88.9 (now flips at 80)
        ],
    )
    def test_flips_name_field(self, predicted, expected):
        assert classify("name", predicted, expected) == (True, "name-fuzzy")

    def test_flips_spouse_name_field(self):
        assert classify("spouse_name", "Christophar", "Christopher") == (
            True,
            "name-fuzzy",
        )

    @pytest.mark.parametrize(
        "predicted,expected",
        [
            ("John Smith", "Jane Doe"),    # different name → ~22 ratio
            ("Anderson", "Wilson"),        # different → far below 80
            ("Christopher", "Alexander"),  # different → far below 80
        ],
    )
    def test_does_not_flip_low_ratio(self, predicted, expected):
        assert classify("name", predicted, expected) == (False, None)

    @pytest.mark.parametrize(
        "predicted,expected",
        [
            ("Li", "Lo"),  # 2 chars — below length floor of 3
            ("Jo", "Ja"),  # 2 chars — below length floor
        ],
    )
    def test_does_not_flip_below_length_floor(self, predicted, expected):
        assert classify("name", predicted, expected) == (False, None)

    @pytest.mark.parametrize(
        "predicted,expected",
        [
            ("Lee", "Lei"),    # 3 chars, 1 edit — passes via distance path
            ("Anna", "Annu"),  # 4 chars, 1 edit — passes via distance path
            ("Tim", "Jim"),    # 3 chars, 1 edit — passes via distance path
        ],
    )
    def test_flips_short_names_via_edit_distance(self, predicted, expected):
        # These would all fail the ratio path (ratio < 80) but pass the
        # absolute Levenshtein distance path (<=2 edits). This is the
        # length-independent OCR-tolerance route.
        assert classify("name", predicted, expected) == (True, "name-fuzzy")

    def test_does_not_flip_dissimilar_short_names(self):
        # 3-edit name differences shouldn't flip — exceeds the 2-edit floor.
        assert classify("name", "Bob", "Tim") == (False, None)

    def test_exact_after_normalization_uses_text_normalized_not_fuzzy(self):
        # Exact after text_norm — should use the cheaper text-normalized rule,
        # not name-fuzzy. Audit trail matters: spot-checking which rule fired
        # is the whole point of having separate names.
        assert classify("name", "JOHN  SMITH", "John Smith") == (
            True,
            "text-normalized",
        )

    def test_name_field_uses_name_fuzzy_label(self):
        # Both fuzzy rules are now field-keyed with the same min_len, so
        # they overlap on inputs. Verify the routing surfaces the right
        # rule name in the audit log.
        assert classify("name", "Marky", "Marko") == (True, "name-fuzzy")

    def test_explain_changes_uses_freeform_fuzzy_label(self):
        assert classify("explain_changes", "Marky", "Marko") == (
            True,
            "freeform-fuzzy",
        )

    def test_empty_predicted_not_flipped(self):
        assert classify("name", "", "Christopher") == (False, None)

    def test_empty_expected_not_flipped(self):
        assert classify("name", "Christopher", "") == (False, None)

    def test_sentinel_expected_not_flipped(self):
        # Spouse Missing is a GT-only sentinel — never flip.
        assert classify("spouse_name", "Spouse Missin", "Spouse Missing") == (
            False,
            None,
        )


# --- freeform-fuzzy --------------------------------------------------------


class TestFreeformFuzzy:
    def test_flips_long_freeform_with_ocr_drift(self):
        predicted = "the applicant lost their job in march of 2026"
        expected = "the appiicant losf their job in march of 2026"  # 2 OCR subs
        assert classify("explain_changes", predicted, expected) == (
            True,
            "freeform-fuzzy",
        )

    def test_flips_paragraph_with_punctuation_drift(self):
        # 32+ chars, single substitution + extra punctuation — text_norm
        # strips trailing punct but preserves mid-sentence chars, so they
        # differ. fuzz.ratio recovers it.
        predicted = "Lost job in March applied for EI"
        expected = "Lost jcb in March; applied for EI"
        assert classify("explain_changes", predicted, expected) == (
            True,
            "freeform-fuzzy",
        )

    def test_flips_medium_freeform_via_edit_distance(self):
        # 12-14 chars with 1 OCR substitution — would fail the old 30-char
        # floor but now passes the 10-char floor, and flips via the
        # edit-distance path (1 edit, <= 4).
        predicted = "I lost my jcb."
        expected = "I lost my job."
        assert classify("explain_changes", predicted, expected) == (
            True,
            "freeform-fuzzy",
        )

    def test_flips_short_paragraph_via_distance_path(self):
        # 15 chars, 1 substitution — ratio is high (~96), but this case
        # specifically verifies the distance path activates on short
        # freeform that was previously rejected by the 30-char floor.
        predicted = "shrt text here a"
        expected = "short text here a"
        assert classify("explain_changes", predicted, expected) == (
            True,
            "freeform-fuzzy",
        )

    def test_does_not_flip_below_length_floor(self):
        # Shorter side is 2 chars — below the 3-char min-length floor.
        predicted = "ok"
        expected = "no"
        assert classify("explain_changes", predicted, expected) == (False, None)

    def test_short_freeform_within_distance_floor_flips(self):
        # 3-char strings at distance 3 will flip via the distance path
        # (3 <= max_edits 4). This is a known trade-off — see the
        # "Two-path fuzzy matching" section in the README for rationale
        # (LLM downstream cleans up the noise).
        assert classify("explain_changes", "yes", "bad") == (
            True,
            "freeform-fuzzy",
        )

    def test_does_not_flip_paraphrased_paragraph_beyond_distance_limit(self):
        # ratio 77.8 (below 80) AND distance 20 (above 4). The paraphrase
        # is too aggressive for either fuzzy path to accept.
        predicted = "lost my job in march of 2026 and rent is too high"
        expected = "lost job in march of 2026 and rent has become too expensive"
        assert classify("explain_changes", predicted, expected) == (False, None)

    def test_does_not_flip_dissimilar_paragraphs(self):
        predicted = "I lost my job in March and moved to a new city for work"
        expected = "My spouse passed away and I am applying for assistance"
        assert classify("explain_changes", predicted, expected) == (False, None)

    def test_freeform_fuzzy_does_not_apply_to_name_field(self):
        # A 30+ char paragraph against a name field should not flip via
        # the freeform rule.
        predicted = "the applicant lost their job in march of 2026"
        expected = "the appiicant losf their job in march of 2026"
        # Both are 45 chars, way over the name length floor — but the name
        # rule fires here because the rule is keyed off the field, not the
        # value. That's correct: at this length the name rule's ≥90 floor
        # is reached too (95.6). The point of this test is just to confirm
        # the rule selection branch is field-keyed, not that this exact
        # pair belongs in a name field.
        result = classify("name", predicted, expected)
        # Should flip via name-fuzzy (because the field is name), NOT
        # freeform-fuzzy.
        assert result == (True, "name-fuzzy")


# --- existing behavior preserved -------------------------------------------


class TestExistingBehaviorUnchanged:
    """Smoke tests for the rules that were already in place — make sure
    the new fall-through hasn't broken them."""

    def test_digits_only_sin(self):
        assert classify("sin", "999-888-777", "999888777") == (True, "digits-only")

    def test_signature_presence(self):
        assert classify("signature", "John", "Jane") == (True, "signature-presence")

    def test_text_normalized_still_works(self):
        # Lower-case + whitespace collapse.
        assert classify("explain_changes", "Lost  Job", "lost job") == (
            True,
            "text-normalized",
        )

    def test_checkbox_tag_normalization(self):
        assert classify("checkbox_foo", ":selected:", "selected") == (
            True,
            "checkbox-tag",
        )


class TestIncomeSingleCharVsDigit:
    """The single-char/digit-to-zero rules were split so the audit log
    distinguishes digit OCR failures from letter/symbol OCR failures."""

    @pytest.mark.parametrize("predicted", ["E", "Q", "o", "-", "/", "$"])
    def test_letter_or_symbol_flips_via_char_zero(self, predicted):
        assert classify("applicant_employment_insurance", predicted, "0") == (
            True,
            "income-single-char-zero",
        )

    @pytest.mark.parametrize("predicted", ["1", "2", "3", "5", "8", "9"])
    def test_single_digit_flips_via_digit_to_zero(self, predicted):
        # Note: predicted="0" expected="0" would already match via
        # numeric-equality (both parse to 0.0), so it never reaches the
        # digit-to-zero rule in real runs.
        assert classify("applicant_employment_insurance", predicted, "0") == (
            True,
            "income-single-digit-to-zero",
        )

    def test_letter_does_not_flip_when_expected_nonzero(self):
        # Both rules require expected = 0.
        assert classify("applicant_employment_insurance", "E", "100") == (
            False,
            None,
        )

    def test_digit_does_not_flip_when_expected_nonzero(self):
        # `5` vs `100` is not a single-digit-to-zero case.
        result = classify("applicant_employment_insurance", "5", "100")
        assert result == (False, None)

    def test_multi_char_does_not_match_either_rule(self):
        # `10` is two chars — neither single-char-zero nor single-digit.
        # It must fall through and stay an error (since numeric-equality
        # gives 10.0 != 0.0).
        assert classify("applicant_employment_insurance", "10", "0") == (
            False,
            None,
        )

    def test_digit_does_not_apply_to_non_income_field(self):
        # `name` field doesn't go through the income branch.
        assert classify("name", "5", "0") == (False, None)

    # Integer-typed predicted values (engines sometimes serialize income
    # fields as JSON numbers rather than strings). These would slip past
    # the original `isinstance(predicted, str)` guard.

    @pytest.mark.parametrize("predicted", [1, 2, 5, 8, 9])
    def test_int_digit_flips_via_digit_to_zero(self, predicted):
        assert classify("applicant_employment_insurance", predicted, "0") == (
            True,
            "income-single-digit-to-zero",
        )

    def test_float_digit_flips_via_digit_to_zero(self):
        # `5.0` is a single-digit float — treat as digit.
        assert classify("applicant_employment_insurance", 5.0, "0") == (
            True,
            "income-single-digit-to-zero",
        )

    def test_float_non_integer_does_not_flip(self):
        # `5.5` is not a single digit.
        assert classify("applicant_employment_insurance", 5.5, "0") == (
            False,
            None,
        )

    def test_int_above_9_does_not_flip(self):
        # `10` is not a single digit.
        assert classify("applicant_employment_insurance", 10, "0") == (
            False,
            None,
        )

    def test_bool_does_not_flip(self):
        # Pure defensive: True is technically `int` subtype in Python.
        # Don't let truthy booleans masquerade as digit predictions.
        assert classify("applicant_employment_insurance", True, "0") == (
            False,
            None,
        )
