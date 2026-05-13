# Iteration diff — `synth-full (1)` (vlm-ocr-hybrid)

Deployment: **gpt-5.2**  •  Total fields: **74**  •  Matched: **69**  •  Mismatched: **5**  •  Field-accuracy: **93.2%**
OCR (DI prebuilt-layout): 5244 ms (5005 markdown chars)  •  VLM call: 48802 ms.  fields populated=74/74 • evidence quotes=74
Prompt hash: `dde229ca`  •  Descriptions hash: `6da27caa`

## Mismatched fields

| field | predicted | expected | source_quote |
|---|---|---|---|
| `date` | "2014-09-06" | ["2014-09-06","2014-Sep-06"] | Date (yyyy-mmm-dd)  2014-Sep-06 |
| `sin` | "350887408" | ["350887408","350 887 408","350-887-408"] | Social Insurance Number  350-887-408 |
| `spouse_date` | "2014-06-10" | ["2014-06-10","2014-Jun-10"] | Date (yyyy-mmm-dd)  2014-Jun-10 |
| `spouse_phone` | "(348) 984 086" | ["(348) 984-086","(348) 984 086"] | Spouse Telephone  (348) 984 086 |
| `spouse_sin` | "612767866" | ["612767866","612 767 866","612-767-866"] | Social Insurance Number  612-767-866 |

<details><summary>Matched fields (collapsed)</summary>

| field | value |
|---|---|
| `applicant_canada_pension_plan_cpp` | 5057.31 |
| `applicant_child_support` | 2326.47 |
| `applicant_child_tax_benefits` | 3181.38 |
| `applicant_employment_insurance` | 8740.25 |
| `applicant_income_of_dependent_children` | 9495.78 |
| `applicant_income_tax_refund` | 1143.66 |
| `applicant_net_employment_income` | 1594.65 |
| `applicant_oas_gis` | 1297.16 |
| `applicant_other_income_money_received` | 6578.34 |
| `applicant_private_pensions_retirement_disability` | 8281.78 |
| `applicant_rental_income` | 8007 |
| `applicant_room_board_income` | 8641 |
| `applicant_spousal_support_alimony` | 289 |
| `applicant_student_funding_loans_bursaries` | 2477 |
| `applicant_tax_credits_gst_credit` | 7986.99 |
| `applicant_trust_income` | 9181 |
| `applicant_workbc_financial_support` | 4218.92 |
| `applicant_workers_compensation` | 9906.37 |
| `checkbox_dependants_no` | "unselected" |
| `checkbox_dependants_yes` | "selected" |
| `checkbox_employment_changes_no` | "unselected" |
| `checkbox_employment_changes_spouse_no` | "selected" |
| `checkbox_employment_changes_spouse_yes` | "unselected" |
| `checkbox_employment_changes_yes` | "selected" |
| `checkbox_family_assets_no` | "selected" |
| `checkbox_family_assets_yes` | "unselected" |
| `checkbox_moved_no` | "selected" |
| `checkbox_moved_spouse_no` | "unselected" |
| `checkbox_moved_spouse_yes` | "selected" |
| `checkbox_moved_yes` | "unselected" |
| `checkbox_need_assistance_no` | "unselected" |
| `checkbox_need_assistance_yes` | "selected" |
| `checkbox_school_no` | "selected" |
| `checkbox_school_spouse_no` | "unselected" |
| `checkbox_school_spouse_yes` | "selected" |
| `checkbox_school_yes` | "unselected" |
| `checkbox_shelter_no` | "selected" |
| `checkbox_shelter_yes` | "unselected" |
| `checkbox_warrant_no` | "unselected" |
| `checkbox_warrant_spouse_no` | "unselected" |
| `checkbox_warrant_spouse_yes` | "selected" |
| `checkbox_warrant_yes` | "selected" |
| `checkbox_work_no` | "unselected" |
| `checkbox_work_spouse_no` | "unselected" |
| `checkbox_work_spouse_yes` | "selected" |
| `checkbox_work_yes` | "selected" |
| `explain_changes` | "Against really decision short nothing interest\nparticularly level summer list go shake woman\nwhile beat. Investment include with view story\nyourself why color treatment prove summer full\nlearn actually among marriage church. Never." |
| `name` | "Kimberly Fuentes" |
| `phone` | "227 837 843" |
| `signature` | "Kimberly Fuentes" |
| `spouse_canada_pension_plan_cpp` | 4637.71 |
| `spouse_child_support` | 6793.84 |
| `spouse_child_tax_benefits` | 4533.52 |
| `spouse_employment_insurance` | 655 |
| `spouse_income_tax_refund` | 6530.16 |
| `spouse_name` | "Duane Harrell" |
| `spouse_net_employment_income` | 3472 |
| `spouse_oas_gis` | 2326.11 |
| `spouse_other_income_money_received` | 4455.12 |
| `spouse_private_pensions_retirement_disability` | 9433.75 |
| `spouse_rental_income` | 8963.36 |
| `spouse_room_board_income` | 6973 |
| `spouse_signature` | "D. Harrell" |
| `spouse_spousal_support_alimony` | 3791.02 |
| `spouse_student_funding_loans_bursaries` | 4463.95 |
| `spouse_tax_credits_gst_credit` | 76.59 |
| `spouse_trust_income` | 4269 |
| `spouse_workbc_financial_support` | 7649 |
| `spouse_workers_compensation` | 7431.61 |

</details>
