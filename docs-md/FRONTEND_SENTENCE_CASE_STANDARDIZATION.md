# Frontend sentence-case standardization

## Summary
- Standardized user-facing frontend copy to sentence case across navigation labels, page headers, modal titles, alert titles, and form labels/placeholders.
- Kept acronyms and domain terms uppercase where appropriate (for example: OCR, APIM, HITL, LLM, UUID, ID).
- Scope was limited to frontend source files in `apps/frontend/src`.

## What was updated
- Navigation labels and shell text
- Workflow editor/display labels
- Group and membership dialog titles
- Benchmarking page titles and modal labels
- Template model and confusion profile page headers
- Tables and dataset creation labels where title case was used

## Validation
- Ran frontend type check successfully:
  - `npm run -w apps/frontend type-check`

## Notes
- This update focused on capitalization consistency only and did not alter feature behavior.
- Test files were not intentionally modified for this pass.
- Intentional exception retained for product naming: "Azure Document Intelligence".
- Intentional exception retained for app branding in the navbar: "Document Intelligence".
