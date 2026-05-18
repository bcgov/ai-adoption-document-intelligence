#!/usr/bin/env python3
"""
Post-process an SDPR benchmark JSON, flipping format-only and semantically-
equivalent mismatches to "matched". Produces a parallel JSON of the same
shape (so analyze.js / compare-engines.py consume it transparently) plus an
audit CSV listing every flipped error.

NOTE: This script is ONE STEP of the benchmark analysis pipeline. For a full
re-regeneration against share data (normalize → recover-zeros → analyze →
report-errors), use `regenerate-reports-share.sh`. Invoking this script
alone produces only partial results — downstream audit reports won't
reflect numeric-zero recovery or cross-engine deltas.

Active rules — keep in sync with the README "Equivalence rules" table:

  sin / phone (`sin`, `spouse_sin`, `phone`, `spouse_phone`)
      digits-only   : same digit sequence after stripping non-digits.
                      `999-888-777` ≡ `999888777`.

  date (`date`, `spouse_date`)
      date-calendar         : both parse to the same calendar date under the
                              SDPR date parser. `2026-Mar-16` ≡ `2026-03-16`.
      date-month-day-swap   : both parse to dates that differ ONLY by the
                              month and day being swapped. `2026-07-03` ≡
                              `2026-03-07`. Useful when an engine inverts the
                              MM/DD order on an unambiguous ISO write-out.

  signature (`signature`, `spouse_signature`)
      signature-presence    : if both predicted and expected are non-empty,
                              treat as matched regardless of value. SDPR only
                              needs to know whether a signature is present;
                              the literal characters don't matter.

  text-like (`name`, `spouse_name`, `explain_changes`)
      text-normalized       : whitespace runs collapsed, case-insensitive,
                              trailing punctuation stripped, hyphen-spacing
                              normalised.
      name-fuzzy            : (name fields only) Two-path fuzzy match:
                              flips if EITHER (a) rapidfuzz Indel ratio
                              >= 80 (handles paragraph-style drift —
                              rarely relevant for names) OR (b) Levenshtein
                              distance <= 2 (handles 1-2 OCR char errors
                              uniformly regardless of name length, so a
                              5-char name with 1 OCR sub flips just like
                              a 30-char one). Length floor: 3 chars
                              (prevents 1-2 char degenerate matches).
                              Identity is independently confirmed by ICM
                              SIN-lookup downstream, so close-enough is
                              acceptable.
      freeform-fuzzy        : (explain_changes only) Two-path fuzzy
                              match: flips if EITHER (a) rapidfuzz Indel
                              ratio >= 80 (handles paragraph-level OCR
                              scatter / minor paraphrasing in long
                              strings) OR (b) Levenshtein distance <= 4
                              (handles up to 4 OCR char errors uniformly
                              regardless of paragraph length). Length
                              floor: 3 chars. LLM post-processing fixes
                              residual drift. NOTE: with min_len=3 and
                              max_edits=4 the distance path will accept
                              mostly-unrelated 3-4 char strings (e.g.
                              `Yes` vs `Bad`, distance 3); accepted as
                              a deliberate trade-off in favour of LLM
                              cleanup catching the noise downstream.

  case_id
      case-id-normalized    : whitespace + case-insensitive.

  income-like (`applicant_*` / `spouse_*` numeric fields)
      currency-chrome       : leading/trailing `$` stripped. `$ 0` ≡ `0`.
      numeric-equality      : both parse to the same number under loose
                              parsing ($, commas, whitespace stripped).
                              Newline-stacked predictions ONLY accepted when
                              every non-empty line parses to the same number
                              and equals expected (`"0\\n0"` ≡ `0`); rejects
                              `"E\\n0"` and `"69\\n606"`.
      income-single-char-zero : a single-character predicted value that is
                              NOT a digit (a letter or symbol) where expected
                              parses to 0. Captures OCR mis-reads like `E`,
                              `Q`, `o`, `-` for an empty income cell that
                              should have read `0`.
      income-single-digit-to-zero : a single-digit predicted value (`0`-`9`)
                              where expected parses to 0. Captures OCR mis-
                              reads where a faint `0` glyph was recognised
                              as the wrong digit (`1`, `8`, etc.).

  checkboxes (`checkbox_*`)
      checkbox-tag          : `selected` ≡ `:selected:` and `unselected` ≡
                              `:unselected:` (case-insensitive). Bridges the
                              backend's tag-style values against the engine's
                              plain-string output.

Never flipped: sentinel GT tags (`:present:`, `:garbled:`, `Spouse Missing`,
`Missed Box`, `Blank Declaration`, `Homeless`, `KEY PLAYER MISSING`),
`missing` errors (predicted empty / expected populated), and `extra` errors
(predicted populated / expected empty). Format variants exist only when
both sides have a value.

Usage:
    python normalize-benchmark.py <input.json> --out <output.json> --changes <changes.csv>

Reads from `<input.json>` (may be `/dev/fd/N` if streamed from a FIFO),
writes to `<output.json>` and `<changes.csv>` (both may also be FIFOs).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

# ---------------------------------------------------------------------------
# Constants — ported from form-field-normalization.ts and
# promote-gt-format-variants.ts
# ---------------------------------------------------------------------------

MONTH_NAME_TO_NUM = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

PROMOTABLE_IDENTIFIER_FIELDS = {"sin", "spouse_sin", "phone", "spouse_phone"}
DATE_FIELDS = {"date", "spouse_date"}
TEXT_LIKE_FIELDS = {"name", "spouse_name", "signature", "spouse_signature", "explain_changes"}
NAME_FIELDS = {"name", "spouse_name"}
FREEFORM_FIELDS = {"explain_changes"}
NON_NUMERIC_PERSON_SUFFIXES = {"name", "phone", "sin", "date", "signature", "email"}

# Fuzzy-match thresholds for the rapidfuzz-based rules. A pair flips if
# EITHER the ratio condition OR the absolute-edit-distance condition holds.
# Two complementary paths cover the two distinct OCR failure modes:
#
#   - THRESHOLD (rapidfuzz.fuzz.ratio, 0-100): catches paragraph-level
#     drift on long strings where character-level edits don't suffice.
#     Designed for the "many small differences in a long string" case
#     (paraphrasing, scattered OCR noise across a sentence). On short
#     strings the ratio is dominated by single-char differences so the
#     ratio path tends to reject what are obviously the same value.
#
#   - MAX_EDITS (Levenshtein distance, absolute): catches OCR character-
#     level errors uniformly regardless of string length — a single
#     substitution is equally forgivable in a 5-char name or a 30-char
#     paragraph. This is the length-INDEPENDENT path; without it, short
#     strings with a single OCR typo are unfairly rejected because the
#     ratio metric is length-sensitive.
#
#   - MIN_LEN: required for both paths. Prevents degenerate matches on
#     1-2 char pairs (where the distance path would near-always succeed).
#
# Caveat: max_edits combined with very small min_len lets the distance
# path flip mostly-unrelated short strings. E.g. with min_len=3 and
# max_edits=4, two completely different 3-char strings (max distance 3)
# still flip. Tune the trade-off per field — names tolerate this less
# than freeform.
NAME_FUZZY_THRESHOLD = 80
NAME_FUZZY_MAX_EDITS = 2
NAME_FUZZY_MIN_LEN = 3
FREEFORM_FUZZY_THRESHOLD = 80
FREEFORM_FUZZY_MAX_EDITS = 4
FREEFORM_FUZZY_MIN_LEN = 3

# Sentinel values used by the local GT pipeline — never an engine prediction,
# always retained as a real mismatch when present.
SENTINEL_GT_VALUES = {
    ":present:", ":garbled:", "KEY PLAYER MISSING", "Spouse Missing",
    "Missed Box", "Blank Declaration", "Homeless",
}


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------


def is_empty_value(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return v.strip() == ""
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


def is_income_like_field(field: str) -> bool:
    if not (field.startswith("applicant_") or field.startswith("spouse_")):
        return False
    tail = re.sub(r"^(applicant|spouse)_", "", field)
    return tail not in NON_NUMERIC_PERSON_SUFFIXES


def digits_only(s: str) -> str:
    return re.sub(r"\D", "", s)


# ---------------------------------------------------------------------------
# Date parsing — Python port of parseToCalendarParts
# ---------------------------------------------------------------------------


def _is_valid_ymd(y: int, m: int, day: int) -> tuple[int, int, int] | None:
    if m < 1 or m > 12 or day < 1 or day > 31:
        return None
    # Validate by round-tripping through a real calendar
    try:
        from datetime import date
        d = date(y, m, day)
        if d.year == y and d.month == m and d.day == day:
            return (y, m, day)
    except ValueError:
        return None
    return None


def _parse_numeric_triplet_date(a_str: str, b_str: str, y_str: str) -> tuple[int, int, int] | None:
    try:
        a = int(a_str)
        b = int(b_str)
        y = int(y_str)
    except ValueError:
        return None
    if len(y_str) == 2:
        y += 1900 if y >= 70 else 2000
    if a > 12:
        return _is_valid_ymd(y, b, a)
    if b > 12:
        return _is_valid_ymd(y, a, b)
    # Ambiguous — try DMY first then MDY, matching the TS preference.
    dmy = _is_valid_ymd(y, b, a)
    if dmy:
        return dmy
    return _is_valid_ymd(y, a, b)


def parse_to_calendar_parts(value: str) -> tuple[int, int, int] | None:
    s = value.strip()
    if not s:
        return None

    # YYYY-MMM-DD (e.g. 2026-Mar-16)
    m = re.match(r"^(\d{4})-([A-Za-z]{3,9})-(\d{1,2})$", s)
    if m:
        try:
            y = int(m.group(1))
            mon = MONTH_NAME_TO_NUM.get(m.group(2).lower())
            day = int(m.group(3))
        except ValueError:
            return None
        if not mon:
            return None
        return _is_valid_ymd(y, mon, day)

    # YYYY-MM-DD
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        try:
            y, mm, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
        except ValueError:
            return None
        return _is_valid_ymd(y, mm, dd)

    # D[/.-]M[/.-]YY[YY] — same separator on both sides
    m = re.match(r"^(\d{1,2})([/.\-])(\d{1,2})\2(\d{2,4})$", s)
    if m:
        return _parse_numeric_triplet_date(m.group(1), m.group(3), m.group(4))

    # Generic JS Date.parse fallback — Python has no exact equivalent, so try
    # a small set of common formats. Conservative: better to miss a variant
    # than to claim two non-equivalent strings are the same date.
    from datetime import datetime
    fallback_formats = [
        "%b %d %Y", "%b %d, %Y", "%d %b %Y", "%d %b, %Y",
        "%B %d %Y", "%B %d, %Y", "%d %B %Y", "%d %B, %Y",
        "%Y/%m/%d",
    ]
    for fmt in fallback_formats:
        try:
            d = datetime.strptime(s, fmt)
            return _is_valid_ymd(d.year, d.month, d.day)
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Numeric / currency helpers
# ---------------------------------------------------------------------------


def parse_strict_numeric(s: str) -> float | None:
    if not s:
        return None
    if not re.match(r"^-?\d+(\.\d+)?$", s):
        return None
    return float(s)


def parse_loose_numeric(v: Any) -> float | None:
    if isinstance(v, bool):
        return None  # bool is int in Python; we don't treat True/False as numbers
    if isinstance(v, (int, float)):
        if v != v or v in (float("inf"), float("-inf")):  # NaN / Inf
            return None
        return float(v)
    if not isinstance(v, str):
        return None
    cleaned = re.sub(r"[$,\s]", "", v)
    return parse_strict_numeric(cleaned)


def strip_currency_chrome(v: str) -> str:
    return re.sub(r"\s*\$$", "", re.sub(r"^\$\s*", "", v.strip()))


def is_currency_format_variant(predicted: str, expected: str) -> bool:
    stripped = strip_currency_chrome(predicted)
    if stripped == predicted:
        return False  # no $ to strip
    return stripped == expected.strip()


def is_numeric_equality_variant(predicted: Any, expected: Any) -> bool:
    e = parse_loose_numeric(expected)
    if e is None:
        return False
    p = parse_loose_numeric(predicted)
    if p is not None and p == e:
        return True
    # Newline-stacked predictions: this happens when OCR reads two adjacent
    # cells as one value (e.g. `"0\n0"` — two zero cells stacked). To accept
    # the stack as a variant of `expected`, we require that EVERY non-empty
    # line parses to the same number AND that number equals expected.
    # Examples accepted: `"0\n0"` → 0, `"50\n50"` → 50.
    # Examples rejected (genuine OCR errors):
    #   `"E\n0"` → 0  (the "E" line is non-numeric — OCR garbled something)
    #   `"69\n606"` → 606  (different numbers on each line — two distinct
    #                        cells, not a clean stack)
    #   `"0\n5"` → 0  (one line matches but the other doesn't — the engine
    #                   actually saw two different things)
    if isinstance(predicted, str) and "\n" in predicted:
        line_values: list[float] = []
        for line in predicted.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue
            lp = parse_loose_numeric(stripped)
            if lp is None:
                return False  # a non-numeric line spoils the stack
            line_values.append(lp)
        if line_values and all(v == line_values[0] for v in line_values) and line_values[0] == e:
            return True
    return False


# ---------------------------------------------------------------------------
# Text-like equivalence
# ---------------------------------------------------------------------------


def normalize_whitespace(v: str) -> str:
    return re.sub(r"\s+", " ", v).strip()


def strip_trailing_punct(v: str) -> str:
    return re.sub(r"[.,;:!?]+$", "", v)


def normalize_hyphen_spacing(v: str) -> str:
    return re.sub(r"\s*-\s*", "-", v)


def text_norm(s: str) -> str:
    return strip_trailing_punct(normalize_hyphen_spacing(normalize_whitespace(s))).lower()


def is_text_equivalence_variant(predicted: str, expected: str) -> bool:
    if predicted == expected:
        return False  # not a variant — already exact
    return text_norm(predicted) == text_norm(expected)


def is_name_fuzzy_variant(predicted: str, expected: str) -> bool:
    np = text_norm(predicted)
    ne = text_norm(expected)
    if np == ne:
        return False  # caller already covered via text-normalized
    if min(len(np), len(ne)) < NAME_FUZZY_MIN_LEN:
        return False
    if fuzz.ratio(np, ne) >= NAME_FUZZY_THRESHOLD:
        return True
    return Levenshtein.distance(np, ne) <= NAME_FUZZY_MAX_EDITS


def is_freeform_fuzzy_variant(predicted: str, expected: str) -> bool:
    np = text_norm(predicted)
    ne = text_norm(expected)
    if np == ne:
        return False
    if min(len(np), len(ne)) < FREEFORM_FUZZY_MIN_LEN:
        return False
    if fuzz.ratio(np, ne) >= FREEFORM_FUZZY_THRESHOLD:
        return True
    return Levenshtein.distance(np, ne) <= FREEFORM_FUZZY_MAX_EDITS


# ---------------------------------------------------------------------------
# Additional rules (SDPR-specific, not in the local promote-gt script)
# ---------------------------------------------------------------------------


def is_date_month_day_swap(predicted: Any, expected: Any) -> bool:
    """Equivalent if predicted parses to (Y, M, D) and expected parses to
    (Y, D, M) — i.e. the year matches and month/day are transposed.

    Example: `2026-07-03` ≡ `2026-03-07`.

    Skipped when month == day (the swap is identity), and when either side
    fails to parse to a calendar date.
    """
    if not (isinstance(predicted, str) and isinstance(expected, str)):
        return False
    p = parse_to_calendar_parts(predicted)
    e = parse_to_calendar_parts(expected)
    if not p or not e:
        return False
    py, pm, pd = p
    ey, em, ed = e
    if pm == pd:
        return False  # swap would be identity
    return py == ey and pm == ed and pd == em


def is_signature_presence_match(predicted: Any, expected: Any) -> bool:
    """For signature fields, ANY non-empty pair is a match. The caller has
    already filtered out the empty-side cases (those stay as missing / extra
    errors), so reaching this rule means both predicted and expected have
    a value — and per SDPR's "we only care about presence" requirement,
    any value pair counts as a successful signature read.
    """
    return not is_empty_value(predicted) and not is_empty_value(expected)


def _normalize_checkbox_token(v: Any) -> str | None:
    """Lowercase + strip surrounding `:`. Returns the canonical token
    (`selected` / `unselected`) or None if the value isn't a checkbox state
    we recognise."""
    if not isinstance(v, str):
        return None
    s = v.strip().lower()
    if s.startswith(":") and s.endswith(":") and len(s) >= 2:
        s = s[1:-1]
    if s in ("selected", "unselected"):
        return s
    return None


def is_checkbox_tag_variant(predicted: Any, expected: Any) -> bool:
    """`selected` ≡ `:selected:` and `unselected` ≡ `:unselected:`. Bridges
    the backend's tag-style strings against the engine's plain output."""
    np = _normalize_checkbox_token(predicted)
    ne = _normalize_checkbox_token(expected)
    if np is None or ne is None:
        return False
    return np == ne


def is_income_single_char_zero(predicted: Any, expected: Any) -> bool:
    """Income cell where the prediction is a single NON-DIGIT character
    and the expected value parses to numeric 0. Captures OCR mis-reads
    where a faint `0` glyph was returned as a stray letter or symbol
    (`E`, `Q`, `o`, `-`, etc.) — the SDPR convention is that those should
    be treated as 0.

    Single-digit predictions (`1`-`9`) are handled by the separate rule
    `income-single-digit-to-zero` so the audit log can distinguish
    letter/symbol mis-reads from wrong-digit recognition.

    Numeric predictions (int/float) are by definition digits, so they
    cannot match this letter/symbol rule.
    """
    if isinstance(predicted, (int, float)) and not isinstance(predicted, bool):
        return False
    if not isinstance(predicted, str):
        return False
    stripped = predicted.strip()
    if len(stripped) != 1:
        return False
    if stripped.isdigit():
        return False
    e = parse_loose_numeric(expected)
    return e is not None and e == 0.0


def is_income_single_digit_to_zero(predicted: Any, expected: Any) -> bool:
    """Income cell where the prediction is a single digit `0`-`9` and the
    expected value parses to numeric 0. Captures OCR cases where a faint
    `0` glyph was recognised as a different digit (`1`, `8`, etc.).

    Accepts both string predictions (`"5"`) and numeric predictions
    (`5`, `5.0`) because benchmark JSON can serialize either type for
    income fields depending on the engine. Booleans are excluded since
    `bool` is a subtype of `int` in Python.

    Kept separate from `income-single-char-zero` so the audit log surfaces
    digit-OCR failures vs letter/symbol-OCR failures distinctly.
    """
    if isinstance(predicted, bool):
        return False
    if isinstance(predicted, int):
        if predicted < 0 or predicted > 9:
            return False
    elif isinstance(predicted, float):
        if predicted != int(predicted) or predicted < 0 or predicted > 9:
            return False
    elif isinstance(predicted, str):
        stripped = predicted.strip()
        if len(stripped) != 1 or not stripped.isdigit():
            return False
    else:
        return False
    e = parse_loose_numeric(expected)
    return e is not None and e == 0.0


# ---------------------------------------------------------------------------
# Per-field decision: is (predicted, expected) a pure format variant?
# Returns (is_variant, rule_name) so the audit CSV can report which rule
# fired.
# ---------------------------------------------------------------------------


def classify_format_variant(
    field: str, predicted: Any, expected: Any
) -> tuple[bool, str | None]:
    # Skip null-side mismatches — those are missing / extra errors, not
    # format variants.
    if is_empty_value(predicted) or is_empty_value(expected):
        return (False, None)

    # Skip sentinel GT values — these tags should not be re-matched.
    if isinstance(expected, str) and expected.strip() in SENTINEL_GT_VALUES:
        return (False, None)

    # SIN / phone — digits-only equality
    if field in PROMOTABLE_IDENTIFIER_FIELDS:
        if isinstance(predicted, str) and isinstance(expected, str):
            if digits_only(predicted) == digits_only(expected) and digits_only(expected):
                return (True, "digits-only")
        return (False, None)

    # Date — calendar parts equality, then month/day-swap fallback
    if field in DATE_FIELDS:
        if isinstance(predicted, str) and isinstance(expected, str):
            p_parts = parse_to_calendar_parts(predicted)
            e_parts = parse_to_calendar_parts(expected)
            if p_parts is not None and e_parts is not None:
                if p_parts == e_parts:
                    return (True, "date-calendar")
                if is_date_month_day_swap(predicted, expected):
                    return (True, "date-month-day-swap")
        return (False, None)

    # Signature — presence only. Checked BEFORE text-like so it overrides
    # the generic text equivalence rule for `signature` / `spouse_signature`.
    if field in ("signature", "spouse_signature"):
        if is_signature_presence_match(predicted, expected):
            return (True, "signature-presence")
        return (False, None)

    # Text-like (name / spouse_name / explain_changes — signature handled above)
    if field in TEXT_LIKE_FIELDS:
        if isinstance(predicted, str) and isinstance(expected, str):
            if is_text_equivalence_variant(predicted, expected):
                return (True, "text-normalized")
            if field in NAME_FIELDS and is_name_fuzzy_variant(predicted, expected):
                return (True, "name-fuzzy")
            if field in FREEFORM_FIELDS and is_freeform_fuzzy_variant(predicted, expected):
                return (True, "freeform-fuzzy")
        return (False, None)

    # Income-like — currency chrome → numeric equality → single-char/digit-zero
    if is_income_like_field(field):
        if is_currency_format_variant(str(predicted), str(expected)):
            return (True, "currency-chrome")
        if is_numeric_equality_variant(predicted, expected):
            return (True, "numeric-equality")
        if is_income_single_char_zero(predicted, expected):
            return (True, "income-single-char-zero")
        if is_income_single_digit_to_zero(predicted, expected):
            return (True, "income-single-digit-to-zero")
        return (False, None)

    # case_id — whitespace + case (alphanumeric IDs)
    if field == "case_id":
        if isinstance(predicted, str) and isinstance(expected, str):
            if predicted.strip().lower() == expected.strip().lower() and predicted != expected:
                return (True, "case-id-normalized")
        return (False, None)

    # Checkboxes — `:selected:` ≡ `selected`, `:unselected:` ≡ `unselected`
    if field.startswith("checkbox_"):
        if is_checkbox_tag_variant(predicted, expected):
            return (True, "checkbox-tag")
        return (False, None)

    return (False, None)


# ---------------------------------------------------------------------------
# JSON processing
# ---------------------------------------------------------------------------


def mean_or_none(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def recompute_per_field_results(per_sample_results: list[dict]) -> list[dict]:
    """Rebuild perFieldResults from the (already-mutated) evaluationDetails.

    Per-field aggregates derived: evaluatedCount, correctCount, errorCount,
    errorRate, accuracy, averageConfidence*, errors[]. Other fields
    (suggestedCatch90 etc.) come from the backend's threshold-suggestion
    logic and are recomputed where possible; the rest are passed through
    unchanged from the original perFieldResults if available.
    """
    by_field: dict[str, list[tuple[dict, str]]] = {}  # field → [(detail, sampleId), ...]
    for sample in per_sample_results:
        sid = sample.get("sampleId", "?")
        for det in sample.get("evaluationDetails") or []:
            name = det.get("field")
            if not isinstance(name, str):
                continue
            by_field.setdefault(name, []).append((det, sid))

    out: list[dict] = []
    for name in sorted(by_field):
        details = by_field[name]
        evaluated = len(details)
        correct = sum(1 for d, _ in details if d.get("matched") is True)
        errors = evaluated - correct
        all_conf = [d.get("confidence") for d, _ in details if isinstance(d.get("confidence"), (int, float))]
        correct_conf = [d.get("confidence") for d, _ in details
                        if d.get("matched") is True and isinstance(d.get("confidence"), (int, float))]
        error_conf = [d.get("confidence") for d, _ in details
                      if d.get("matched") is False and isinstance(d.get("confidence"), (int, float))]

        error_entries: list[dict] = []
        for d, sid in details:
            if d.get("matched") is not False:
                continue
            error_entries.append({
                "sampleId": sid,
                "expected": d.get("expected"),
                "predicted": d.get("predicted"),
                "confidence": d.get("confidence"),
                "matched": False,
            })

        out.append({
            "name": name,
            "evaluatedCount": evaluated,
            "correctCount": correct,
            "errorCount": errors,
            "errorRate": (errors / evaluated) if evaluated else 0.0,
            "accuracy": (correct / evaluated) if evaluated else 0.0,
            "averageConfidence": mean_or_none(all_conf),
            "averageConfidenceCorrect": mean_or_none(correct_conf),
            "averageConfidenceErrors": mean_or_none(error_conf),
            "errors": error_entries,
        })
    return out


def normalize_export(raw: dict) -> tuple[dict, list[dict]]:
    """Mutate the export in-place: flip matched on format-variant errors,
    recompute perFieldResults. Returns (normalised_export, changes_log)."""
    changes: list[dict] = []
    samples = raw.get("perSampleResults") or []
    for sample in samples:
        sid = sample.get("sampleId", "?")
        for det in sample.get("evaluationDetails") or []:
            if det.get("matched") is True:
                continue
            field = det.get("field")
            if not isinstance(field, str):
                continue
            predicted = det.get("predicted")
            expected = det.get("expected")
            is_variant, rule = classify_format_variant(field, predicted, expected)
            if not is_variant:
                continue
            det["matched"] = True
            det["matchedVia"] = f"normalized:{rule}"
            changes.append({
                "sampleId": sid,
                "field": field,
                "predicted": predicted,
                "expected": expected,
                "rule": rule,
            })

    # Drop the now-matched entries from perFieldResults[].errors, and
    # recompute per-field aggregates from the mutated evaluationDetails.
    raw["perFieldResults"] = recompute_per_field_results(samples)

    # Stamp a top-level marker so downstream tooling can tell this export
    # came from the normaliser and how many flips happened.
    raw["normalization"] = {
        "appliedBy": "scripts/benchmark analysis/normalize-benchmark.py",
        "ruleset": "full (sin, phone, date, text-like, income-like, case_id)",
        "flippedCount": len(changes),
    }
    return raw, changes


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def serialize_value_for_csv(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="benchmark JSON path (or /dev/fd/N for FIFO)")
    ap.add_argument("--out", required=True, help="output normalised JSON path")
    ap.add_argument("--changes", required=True, help="output audit CSV path")
    args = ap.parse_args(argv)

    raw_text = Path(args.input).read_text("utf-8")
    raw = json.loads(raw_text)
    normalised, changes = normalize_export(raw)

    # Write the normalised JSON.
    Path(args.out).write_text(json.dumps(normalised, ensure_ascii=False, indent=2), "utf-8")

    # Write the audit CSV.
    with open(args.changes, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sampleId", "field", "rule", "predicted", "expected"])
        for c in changes:
            w.writerow([
                c["sampleId"],
                c["field"],
                c["rule"],
                serialize_value_for_csv(c["predicted"]),
                serialize_value_for_csv(c["expected"]),
            ])

    # Diagnostic summary to stderr (safe to surface — counts only, no values).
    by_rule: dict[str, int] = {}
    by_field: dict[str, int] = {}
    for c in changes:
        by_rule[c["rule"]] = by_rule.get(c["rule"], 0) + 1
        by_field[c["field"]] = by_field.get(c["field"], 0) + 1
    sys.stderr.write(f"flipped {len(changes)} errors → matched=true\n")
    sys.stderr.write(f"  by rule: {by_rule}\n")
    if len(by_field) <= 20:
        sys.stderr.write(f"  by field: {by_field}\n")
    else:
        top = sorted(by_field.items(), key=lambda x: -x[1])[:10]
        sys.stderr.write(f"  top 10 fields: {top}  (+{len(by_field) - 10} more)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
