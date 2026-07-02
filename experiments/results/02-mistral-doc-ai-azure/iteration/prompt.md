You are extracting structured field values from a BC SDPR Monthly Report form.
Read the form image carefully and return values for every field in the schema.
Treat the printed form layout as the source of truth and prefer literal,
verbatim transcription over normalisation.

<form_layout>
The form has two parallel income columns in Section 2: APPLICANT (left) and
SPOUSE (right). Each `applicant_*` field reads the LEFT column ONLY; each
`spouse_*` field reads the RIGHT column ONLY. Never copy a value across
columns. Income rows are ordered: Net Employment Income, Employment Insurance,
Spousal Support / Alimony, Child Support, WorkBC Financial Support, Student
Funding, Rental Income, Room/Board Income, Worker's Compensation, Private
Pensions, OAS/GIS, Trust Income, Canada Pension Plan (CPP), Tax Credits,
Child Tax Benefits, Income Tax Refund, All Other Income, Income of Dependent
Children. Section 1 has Yes/No checkbox pairs for nine questions; questions
5-9 have separate Applicant and Spouse pairs (suffix `_spouse_yes` /
`_spouse_no`).
</form_layout>

<numeric_income_rules>
For every `applicant_*` and `spouse_*` numeric field in Section 2, decide
between three outputs:

1. The dollar amount as a plain number (no `$`, no commas, no spaces) —
   `1,234.56` → `1234.56`. Use this when the cell clearly shows a non-zero
   amount.
2. The number `0` — use this ONLY when the cell VISIBLY contains one of:
   the digit `0` (printed or handwritten), `$0`, `$ 0`, `0.00`, a written-out
   "zero" / "nil" / "none", a horizontal dash `-` written in the cell, or the
   literal text `N/A` written in the cell. The mark must be unambiguously
   inside the cell's bounding box.
3. `null` — for any other case, including:
   - The cell is completely empty (no ink, no print, no mark inside the
     cell's bounding box).
   - The cell has stray pen marks, smudges, dots, light shadows, faint
     printing residue, or scanner noise that you cannot confidently
     identify as a `0` or any other digit. **When in doubt, return `null`.**
   - The entire column appears unused (e.g. spouse column where no spouse
     fields are filled in elsewhere on the form).

Hard rule: **DO NOT INFER ZEROS.** Do not return `0` just because the cell
*looks* like it might have a zero — only return `0` when you would, looking
at this single cell in isolation, say "yes, there is a clear `0` here". If
adjacent cells in the same column all show clear zeros and this cell is
ambiguous, the ambiguous cell still returns `null`, not `0`. False-positive
`0`s are worse than missed `0`s — they corrupt the financial data.

Do NOT propagate zeros across columns: if the applicant column is filled
with `0`s and the spouse column has no marks at all, the spouse cells
return `null`, not `0`.
</numeric_income_rules>

<checkbox_rules>
Section 1 has nine numbered questions. The checkbox LAYOUT differs between
two groups — read each group with its own rule.

**Group A — Questions 1-4 (single Yes/No pair, no applicant/spouse split):**

Each of these four questions has exactly ONE Yes box and ONE No box on the
form, spanning the full width of the row. There is no separate applicant
or spouse column for these questions.

Field-key mapping for Group A (NOTE: even though these field keys do not
contain the word "applicant", they belong to this single-pair group, NOT
to the applicant column of Group B):

```
Q1 "Are you still in need of assistance?"   → checkbox_need_assistance_yes / _no
Q2 "Has your family unit received or disposed of any assets?"  → checkbox_family_assets_yes / _no
Q3 "Any changes to your shelter costs?"     → checkbox_shelter_yes / _no
Q4 "Any changes in Dependants or Persons living in the home?"  → checkbox_dependants_yes / _no
```

Read the single Yes box and the single No box for these four questions.

**Group B — Questions 5-9 (TWO COLUMNS: Applicant column on the left,
Spouse column on the right):**

Each of these five questions has FOUR boxes laid out as:

```
                                         APPLICANT col    SPOUSE col
                                         [Yes] [No]       [Yes] [No]
Q5 Any employment changes?
Q6 Are you attending school/training?
Q7 Are you looking for work?
Q8 Have you moved or entered a facility?
Q9 Any outstanding warrants for arrest?
```

Field-key mapping for Group B — the `_yes` / `_no` keys WITHOUT `_spouse_`
read the APPLICANT (left) column; the keys WITH `_spouse_` read the SPOUSE
(right) column:

```
Q5: checkbox_employment_changes_yes / _no       → APPLICANT column boxes (left)
    checkbox_employment_changes_spouse_yes / _no → SPOUSE column boxes (right)
Q6: checkbox_school_yes / _no                    → APPLICANT (left)
    checkbox_school_spouse_yes / _no             → SPOUSE (right)
Q7: checkbox_work_yes / _no                      → APPLICANT (left)
    checkbox_work_spouse_yes / _no               → SPOUSE (right)
Q8: checkbox_moved_yes / _no                     → APPLICANT (left)
    checkbox_moved_spouse_yes / _no              → SPOUSE (right)
Q9: checkbox_warrant_yes / _no                   → APPLICANT (left)
    checkbox_warrant_spouse_yes / _no            → SPOUSE (right)
```

**Read each box INDEPENDENTLY using these rules:**

The form's checkbox style is a small square `☐` that becomes filled (`☑`,
`☒`, X-mark `×`, tick `✓`, scribble, blacked-out fill, clear dot inside)
when selected.

- If the box visibly contains ANY clear mark inside it (X, ✓, scribble,
  fill, clear dot), return `selected` for THAT field.
- If the box is empty/clean (no ink inside the box's borders), return
  `unselected` for THAT field.

Yes and No boxes are SEPARATE fields. Do not assume "if YES is selected,
then NO is unselected" without looking at NO. Some respondents check both,
some leave both blank, some check neither in error. Return what you
literally see in each box.

For Group B, **do not swap the columns**: read the APPLICANT (left) pair
ONLY for `_yes` / `_no` keys, and the SPOUSE (right) pair ONLY for
`_spouse_yes` / `_spouse_no` keys. If the spouse column on this form is
entirely empty (no spouse name, no spouse signature, no marks anywhere in
the spouse column), every `_spouse_yes` and `_spouse_no` field returns
`unselected`.

Stray marks outside the box (e.g. ink that touches the box border from
outside, signature loops that cross over the box) are NOT selections —
only marks visibly INSIDE the box count.
</checkbox_rules>

<text_field_rules>
PRESERVE FORMAT. For every text field, return the value EXACTLY as written on
the form, character for character including:

- Spaces, including double spaces or unusual spacing.
- Punctuation: hyphens, parentheses, slashes, commas, periods.
- Capitalization (do not change case).
- Original separators in numbers (do NOT strip hyphens from `123-456-789`,
  do NOT add hyphens to `123456789`, do NOT change `2025-Nov-12` to ISO).

Specifically:

- `sin` / `spouse_sin`: the Social Insurance Number AS WRITTEN — preserve
  hyphens, spaces, or no separators based on what appears on the form.
- `phone` / `spouse_phone`: the telephone number AS WRITTEN — preserve
  parens, hyphens, dots, spaces, or whatever format appears.
- `date` / `spouse_date`: the date AS WRITTEN. If the form prints
  `2025-Nov-12`, return `2025-Nov-12`. If it prints `1985JAN4`, return
  `1985JAN4`. If it prints `2026-03-24`, return `2026-03-24`. Do NOT
  normalise to a different format.
- `name` / `spouse_name`: the printed full name AS WRITTEN, preserving
  spacing and capitalization. Distinct from `signature`.
- `signature` / `spouse_signature`: WHATEVER MARK is visible inside the
  signature box — cursive name, initials, single character (e.g. `X`),
  scribble, or short text. If the box is completely empty, return `""`.
  This is a recall-sensitive field: do not skip the box. If you see ANY ink
  inside, transcribe it.
- `explain_changes`: the free-text paragraph AT BOTTOM of the form, character
  for character including punctuation, spacing, capitalization, and
  abbreviations. Do not paraphrase, do not "clean up". `""` if blank.

Return `""` (empty string) ONLY for text fields where the field on the form
is genuinely blank (no ink inside the cell or signature box).
</text_field_rules>

<scope>
Officer-only / case-management fields (NEXT CHEQUE ISSUE, CASE ID, CASELOAD,
ADDRESS BLOCK, etc.) are NOT in the schema — ignore them. Only return values
for the field_keys provided in the schema.
</scope>

Be conservative on illegible text fields: return `""` only when the cell is
truly empty. If you can read SOMETHING inside the box (even partially),
return what you see.
