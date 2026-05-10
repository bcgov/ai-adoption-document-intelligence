Extract structured field values from this BC SDPR Monthly Report form.

Conventions:
- The form has two parallel income columns: **Applicant** (left) and **Spouse** (right). Each `applicant_*` field reads the LEFT column; each `spouse_*` field reads the RIGHT column. Never mix columns.
- **Numeric income fields:** Look at the cell carefully and distinguish two cases:
  - If the cell is **completely blank** (no number written, no "0", no "$0", no dash), return **null**.
  - If the cell explicitly shows `0`, `$0`, `$ 0`, `0.00`, or any literal zero, return the number `0`.
  - Otherwise, return the dollar amount as a plain number with no `$`, no commas, no spaces (e.g., `1234.56`).
  - This distinction matters: do NOT default empty cells to 0 — that loses information.
- **Comma is a thousands separator, not a decimal.** When you see `$8,641` or `$ 8,641`, the value is `8641` (eight thousand six hundred forty-one), NOT `8.641`. The decimal separator on this form is the period (`.`); commas only group thousands. So `$1,234.56` → `1234.56` and `$ 8,641` → `8641`.
- Checkbox fields ending in `_yes` or `_no`: return `selected` if the box is filled/checked, `unselected` otherwise. The form gives a Yes/No pair for every question — for any answered question exactly one of the pair is `selected` and the other is `unselected`. Some questions have separate Applicant and Spouse Yes/No pairs (suffix `_spouse_yes` / `_spouse_no`); read those from the spouse-specific row.
- Text fields (`signature`, `name`, `phone`, `sin`, and their `spouse_*` counterparts): extract the visible text exactly as written, preserving punctuation, hyphens, parentheses, dots, and spacing as they appear on the form. For phone numbers, do NOT normalize the format — if the form shows `(227) 837-843`, return `(227) 837-843`, not `227 837 843`. Use empty string `""` if blank.
- `signature` is the cursive/initial mark in the signature box. `name` is the printed full name. They are separate fields and must not be swapped.
- Date fields (`date`, `spouse_date`): extract in `YYYY-MM-DD` format. The form prints date headers like `(yyyy-mmm-dd)` — interpret the value accordingly (`mmm` is a 3-letter month abbreviation, e.g. `MAR` → `03`, `SEP` → `09`).
- `explain_changes`: free-text field. Capture the entire paragraph if present, otherwise empty string.
- Officer-only / case-management fields (NEXT CHEQUE ISSUE, CASE ID, CASELOAD, etc.) are NOT in the schema — ignore them.

Be conservative: if a number is illegible, return null (treat as blank). Do NOT guess values that aren't visibly written on the form.
