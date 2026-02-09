Purpose
This is a 5-page OCR test packet containing 3 documents intended to validate money amounts only on a “primary” monthly report using supporting evidence. Payroll/bank numbers can differ by small rounding amounts, so validation should allow a small tolerance rather than requiring perfect equality.

Document layout
Document 1 (Primary): Pages 1–3

Page 1: Monthly Report (Financial Assistance Request) form with self-reported income amounts

Page 2: Supporting doc #1 (Pay stub) with gross/deductions/net amounts

Page 3: Supporting doc #2 (Bank deposit record / statement excerpt) with deposit amounts

Document 2 (Supporting): Page 4 (separate document, standalone)

Document 3 (Supporting): Page 5 (separate document, standalone)

Expected output
Split the 5-page PDF/TIFF into 3 document objects with page ranges: **[1–3],, **.

Extract only currency fields and run numeric reconciliation on Document 1, using the other documents as evidence.

Money fields to extract (Document 1 primary)
Extract only values that look like currency (e.g., 1234.56, $1,234.56) from:

Page 1 (Monthly report): gross pay per pay period, net pay (deposit) per pay period, other income amounts (e.g., child support), total gross employment income, total other income, grand total income.

Page 2 (Pay stub): gross pay, total deductions, net pay.

Page 3 (Bank record): deposit amounts (payroll deposit amounts, other deposits such as child support).

Do not require matching names, addresses, dates, IDs, or employer strings for this mode (store them if you want, but don’t gate “pass/fail” on them).

Validation rules (money-only)
A) Pay stub arithmetic (Page 2 internal)
Check: Net pay ≈ Gross pay − Total deductions, with tolerance (recommended: ±$0.01 to ±$0.05).

B) Primary ↔ pay stub amount match (Page 1 vs Page 2)
For each pay period that your pipeline associates, check:

Page 1 gross pay ≈ Page 2 gross pay (tolerance)

Page 1 net pay (deposit) ≈ Page 2 net pay (tolerance)

C) Primary ↔ bank deposits (Page 1 vs Page 3)
For each Page 1 “net pay (deposit)” amount, check that an equal (within tolerance) deposit amount exists on Page 3.
​

For each Page 1 “other income” amount (e.g., child support), check that an equal (within tolerance) deposit amount exists on Page 3.

D) Primary totals (Page 1 internal)
Check Page 1 totals reconcile (within tolerance):

Total gross employment ≈ sum of gross pay line items

Total other income ≈ sum of other income line items

Grand total ≈ total gross employment + total other income
Small penny differences can occur due to rounding, so don’t fail solely on a 1–2 cent delta if your tolerance allows it.

Splitting workflow (5 pages → 3 documents)
1) Page classification
Run OCR per page and classify pages into:

Monthly report form (money table + totals)

Pay stub (earnings/deductions/net)

Bank deposit record (deposit list)

Other standalone document (Doc 2)

Other standalone document (Doc 3)

(For this test packet, you can also use fixed ranges without classification.)

2) Boundary detection (deterministic for this packet)
Doc 1 start = Page 1

Doc 1 end = Page 3

Doc 2 = Page 4

Doc 3 = Page 5

3) Evidence linking (money-only)
Because you’re validating money only, link evidence primarily by amount matching:

Link Pay stub ↔ Page 1 via matching gross and net amounts (within tolerance).

Link Bank record ↔ Page 1 via matching deposit amounts (within tolerance).
​

4) Decisioning (money-only)
Compute a pass/fail plus a discrepancy list:

Pass if: (1) pay stub arithmetic passes, (2) at least one payroll net pay amount from Page 1 is found as a deposit on Page 3, and (3) Page 1 totals reconcile within tolerance.

