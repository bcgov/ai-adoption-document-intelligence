# Label suggestions bench

A dev-only harness that scores the platform's label suggestions against a known answer key. It never ships.

## What it does

1. **download**: fetches the public fillable BC forms listed in `forms.json` into `.cache/forms/`.
2. **generate**: fills each form N times with made-up values, flattens it into a plain PDF, and writes `.cache/copies/<form>/copy-<n>.pdf` with an answer key, `copy-<n>.answers.json`, holding each field's value and the rectangle it sits in.
3. **run-labels**: for each form, creates a template model with the answer-key fields, uploads the copies through the platform (so its real OCR runs), asks for suggested labels on every copy, and scores them against the ground truth. The ground truth is the OCR words whose centres fall inside each field's rectangle. The report goes to `.cache/runs/<name>/labels-report.md` and `.json`.
4. **run-fields**: uploads copy 1 of each form into an empty template model, asks for suggested fields, and scores them by value. The report goes to `.cache/runs/<name>/fields-report.md` and `.json`.

## Scores

- **Suggested labels**, per field on each copy:
  - **exact**: the suggested words are exactly the ground truth;
  - **partial**: they overlap it;
  - **wrong**: no overlap;
  - **missed**: no suggestion.

  A field is **unverifiable**, and left out, when its OCR words don't join back into the value (clipped or split text). Radio groups and dropdowns are filled but not scored.
- **Suggested fields**:
  - text fields found: answer-key values that some suggested field's value matches;
  - matching suggestions: suggested values that equal some answer-key value;
  - checkbox count: suggested checkbox fields against answer-key checkboxes.

## Running

From `apps/backend-services`, with the whole stack running locally:

```bash
npx tsx scripts/label-suggestions-bench/src/cli.ts ping
npx tsx scripts/label-suggestions-bench/src/cli.ts download
npx tsx scripts/label-suggestions-bench/src/cli.ts generate --copies 20
npx tsx scripts/label-suggestions-bench/src/cli.ts run-labels --name baseline-rules --engine "rule-based (before LLM suggestions)" --copies 10
npx tsx scripts/label-suggestions-bench/src/cli.ts run-fields --name llm-1 --engine "LLM, deployment <name>"
```

Settings, read from the environment or the repo's `.env` files; values are never printed:

| Variable | Default | Purpose |
|---|---|---|
| `BENCH_API_KEY` | `TEST_API_KEY` | API key for the bench group |
| `BENCH_GROUP_ID` | `seeddefaultgroup` | Group the key belongs to. An API key cannot look this up, so it comes from here |
| `BENCH_BACKEND_URL` | `http://localhost:3002` | Backend base URL |

`run-labels --with-descriptions` sends each field's PDF tooltip as its description. Use it only against a backend that has the field-description column.

## Cost and clean-up

- **Document Intelligence:** each run pays for layout OCR, about USD 1.50 per 1,000 pages. Ten forms × 10 copies is about 200 pages.
- **LLM:** suggestion calls add LLM usage on the configured deployment.
- **Template models:** each run creates one per form, named `bench <form> <run>`. Delete them from the Template models page when you're done.

## Licence

The forms are © Province of British Columbia and are used here internally only. They and every generated copy stay in `.cache/`, which git ignores; the repository is public.
