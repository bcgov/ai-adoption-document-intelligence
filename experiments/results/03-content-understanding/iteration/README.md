# E03 prompt-iteration kit (Azure Content Understanding)

Tunable inputs for the CU analyzer extraction:

- **`prompt.md`** — global instruction text. Set as the analyzer's top-level
  `description`. Free-form, edit anything.
- **`field-descriptions.json`** — per-field `description` overlay attached to
  each property in the analyzer's `fieldSchema.fields`. Keys must match the
  SDPR template's `field_key`s exactly. Set a value to `""` to drop that
  field's description.

Run a single sample (default: `synth-full (1)` — synth samples are typed
and clean, ideal for prompt tuning):

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/iterate-cu-extraction.ts "synth-full (1)"
```

The script:

1. Builds the CU analyzer JSON from the seeded SDPR template + the editable
   prompt + field descriptions.
2. PUTs the analyzer to CU (idempotent — same body hash → no-op on the
   server side, but PUT is always sent so a stale deploy is overwritten).
3. POSTs an analyze request with the sample image and polls until terminal.
4. Compares predicted to expected, prints a per-field diff, dumps:

   - **`last-request.json`** — analyzer body + analyze submission body.
   - **`last-response.json`** — raw CU operation response (the GET poll
     result; carries `result.contents[0].markdown` + `.fields`).
   - **`last-diff.md`** — markdown table of matched / mismatched fields.

Iteration loop:

1. Edit `prompt.md` and/or `field-descriptions.json`.
2. Re-run the script (~10–25 s per sample under the CU quota).
3. Inspect `last-diff.md`; tune; repeat.

When the prompts are good on a couple of representative samples, copy the
content of `prompt.md` and `field-descriptions.json` into the workflow
JSON's `azureContentUnderstanding.analyze` activity `parameters`
(`documentAnnotationPrompt`, `fieldDescriptions`, `numericFieldsNullable:
true`), then re-seed (`npm run test:db:reset`) and trigger the full
benchmark via `./scripts/run-experiment-benchmarks.sh 03`.
