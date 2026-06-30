# Iteration diff — `1 81` (vlm-ocr-hybrid)

Deployment: **gpt-4o**  •  Total fields: **74**  •  Matched: **66**  •  Mismatched: **8**  •  Field-accuracy: **89.2%**
OCR (DI prebuilt-layout): 9435 ms (4092 markdown chars)  •  VLM call: 63440 ms.  fields populated=50/74 • evidence quotes=73
Prompt hash: `dde229ca`  •  Descriptions hash: `6da27caa`

## Mismatched fields

| field | predicted | expected | source_quote |
|---|---|---|---|
| `applicant_income_tax_refund` | 6000 | "60.00" | Income Tax Refund
Applicant $60,00 |
| `applicant_spousal_support_alimony` | 0 | "" | Spousal Support / Alimony
Applicant $0 |
| `checkbox_moved_no` | "selected" | "unselected" | Have you moved or entered a facility? Applicant Yes ☐ No ☒ |
| `checkbox_school_no` | "selected" | "unselected" | Are you attending/enrolled in school or training? Applicant Yes ☐ No ☒ |
| `checkbox_warrant_no` | "selected" | "unselected" | Any outstanding warrants for your arrest? Applicant Yes ☐ No ☒ |
| `checkbox_work_no` | "selected" | "unselected" | Are you looking for work? Applicant Yes ☐ No ☒ |
| `date` | "2026-25-07" | "2026-07-25" | Date (yyyy-mmm-dd)
2026-25-07 |
| `sin` | "96789954" | ["96789954","967-89-954"] | Social Insurance Number
967-89-954 |

<details><summary>Matched fields (collapsed)</summary>

| field | value |
|---|---|
| `applicant_canada_pension_plan_cpp` | 0 |
| `applicant_child_support` | 0 |
| `applicant_child_tax_benefits` | 0 |
| `applicant_employment_insurance` | 700 |
| `applicant_income_of_dependent_children` | 0 |
| `applicant_net_employment_income` | 0 |
| `applicant_oas_gis` | 0 |
| `applicant_other_income_money_received` | 0 |
| `applicant_private_pensions_retirement_disability` | 0 |
| `applicant_rental_income` | 0 |
| `applicant_room_board_income` | 0 |
| `applicant_student_funding_loans_bursaries` | 0 |
| `applicant_tax_credits_gst_credit` | 0 |
| `applicant_trust_income` | 0 |
| `applicant_workbc_financial_support` | 0 |
| `applicant_workers_compensation` | 0 |
| `checkbox_dependants_no` | "selected" |
| `checkbox_dependants_yes` | "unselected" |
| `checkbox_employment_changes_no` | "unselected" |
| `checkbox_employment_changes_spouse_no` | "selected" |
| `checkbox_employment_changes_spouse_yes` | "unselected" |
| `checkbox_employment_changes_yes` | "unselected" |
| `checkbox_family_assets_no` | "selected" |
| `checkbox_family_assets_yes` | "unselected" |
| `checkbox_moved_spouse_no` | "selected" |
| `checkbox_moved_spouse_yes` | "unselected" |
| `checkbox_moved_yes` | "unselected" |
| `checkbox_need_assistance_no` | "unselected" |
| `checkbox_need_assistance_yes` | "selected" |
| `checkbox_school_spouse_no` | "selected" |
| `checkbox_school_spouse_yes` | "unselected" |
| `checkbox_school_yes` | "unselected" |
| `checkbox_shelter_no` | "selected" |
| `checkbox_shelter_yes` | "unselected" |
| `checkbox_warrant_spouse_no` | "selected" |
| `checkbox_warrant_spouse_yes` | "unselected" |
| `checkbox_warrant_yes` | "unselected" |
| `checkbox_work_spouse_no` | "selected" |
| `checkbox_work_spouse_yes` | "unselected" |
| `checkbox_work_yes` | "unselected" |
| `explain_changes` | "" |
| `name` | "X" |
| `phone` | "" |
| `signature` | "KEY PLAYER MISSING" |
| `spouse_canada_pension_plan_cpp` | null |
| `spouse_child_support` | null |
| `spouse_child_tax_benefits` | null |
| `spouse_date` | "" |
| `spouse_employment_insurance` | null |
| `spouse_income_tax_refund` | null |
| `spouse_name` | "" |
| `spouse_net_employment_income` | null |
| `spouse_oas_gis` | null |
| `spouse_other_income_money_received` | null |
| `spouse_phone` | "" |
| `spouse_private_pensions_retirement_disability` | null |
| `spouse_rental_income` | null |
| `spouse_room_board_income` | null |
| `spouse_signature` | "" |
| `spouse_sin` | "" |
| `spouse_spousal_support_alimony` | null |
| `spouse_student_funding_loans_bursaries` | null |
| `spouse_tax_credits_gst_credit` | null |
| `spouse_trust_income` | null |
| `spouse_workbc_financial_support` | null |
| `spouse_workers_compensation` | null |

</details>
