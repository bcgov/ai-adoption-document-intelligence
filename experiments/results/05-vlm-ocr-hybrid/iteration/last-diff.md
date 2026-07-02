# Iteration diff — `81 blank` (vlm-ocr-hybrid)

Deployment: **gpt-5.4**  •  Total fields: **75**  •  Matched: **68**  •  Mismatched: **7**  •  Field-accuracy: **90.7%**
OCR (DI prebuilt-layout): 9099 ms (3461 markdown chars)  •  VLM call: 18705 ms.  fields populated=49/74 • evidence quotes=66
Prompt hash: `dde229ca`  •  Descriptions hash: `6da27caa`

## Mismatched fields

| field | predicted | expected | source_quote |
|---|---|---|---|
| `checkbox_family_assets_yes` | "unselected" | "selected" | Has your family unit received or disposed of any assets?  Yes No |
| `checkbox_shelter_no` | "selected" | "unselected" | Any changes to your shelter costs?  Yes No |
| `checkbox_shelter_yes` | "unselected" | "selected" | Any changes to your shelter costs?  Yes No |
| `checkbox_warrant_no` | "selected" | "unselected" | Any outstanding warrants for your arrest?  Yes No |
| `phone` | "789-654-812" | "" | 789-654-812 |
| `signature` | "Sarah Melbourne" | "Blank Declration" | Sarah Melbourne |
| `sin` | "" | ["789654812","789 654 812","789-654-812"] |  |

<details><summary>Matched fields (collapsed)</summary>

| field | value |
|---|---|
| `applicant_canada_pension_plan_cpp` | 0 |
| `applicant_child_support` | 0 |
| `applicant_child_tax_benefits` | 0 |
| `applicant_employment_insurance` | 0 |
| `applicant_income_of_dependent_children` | 0 |
| `applicant_income_tax_refund` | 0 |
| `applicant_net_employment_income` | 0 |
| `applicant_oas_gis` | 0 |
| `applicant_other_income_money_received` | 0 |
| `applicant_private_pensions_retirement_disability` | 0 |
| `applicant_rental_income` | 0 |
| `applicant_room_board_income` | 0 |
| `applicant_spousal_support_alimony` | 0 |
| `applicant_student_funding_loans_bursaries` | 0 |
| `applicant_tax_credits_gst_credit` | 0 |
| `applicant_trust_income` | 0 |
| `applicant_workbc_financial_support` | 0 |
| `applicant_workers_compensation` | 0 |
| `case_id` | (empty) |
| `checkbox_dependants_no` | "selected" |
| `checkbox_dependants_yes` | "unselected" |
| `checkbox_employment_changes_no` | "selected" |
| `checkbox_employment_changes_spouse_no` | "unselected" |
| `checkbox_employment_changes_spouse_yes` | "unselected" |
| `checkbox_employment_changes_yes` | "unselected" |
| `checkbox_family_assets_no` | "selected" |
| `checkbox_moved_no` | "selected" |
| `checkbox_moved_spouse_no` | "unselected" |
| `checkbox_moved_spouse_yes` | "unselected" |
| `checkbox_moved_yes` | "unselected" |
| `checkbox_need_assistance_no` | "unselected" |
| `checkbox_need_assistance_yes` | "selected" |
| `checkbox_school_no` | "selected" |
| `checkbox_school_spouse_no` | "unselected" |
| `checkbox_school_spouse_yes` | "unselected" |
| `checkbox_school_yes` | "unselected" |
| `checkbox_warrant_spouse_no` | "unselected" |
| `checkbox_warrant_spouse_yes` | "unselected" |
| `checkbox_warrant_yes` | "unselected" |
| `checkbox_work_no` | "selected" |
| `checkbox_work_spouse_no` | "unselected" |
| `checkbox_work_spouse_yes` | "unselected" |
| `checkbox_work_yes` | "unselected" |
| `date` | "" |
| `explain_changes` | "" |
| `name` | "BLANK DECLARATION" |
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
