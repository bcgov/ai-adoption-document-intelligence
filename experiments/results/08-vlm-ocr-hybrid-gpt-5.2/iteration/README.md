# E08 prompt-iteration kit (VLM + OCR hybrid, gpt-5.2)

Standalone copy of [E05's iteration kit](../../05-vlm-ocr-hybrid/iteration/),
unchanged on prompt content — only the deployment target swaps from
`gpt-5.4` to `gpt-5.2`. The SDPR-form quirks (column conventions,
blank-vs-zero, signature-vs-name) are engine-agnostic, so prompts and
field descriptions transfer verbatim.

Tunable inputs for the VLM + OCR hybrid extraction:

- **`prompt.md`** — global instruction text. Sent as the chat-completions
  `system` message preamble (alongside a hybrid-specific paragraph that
  tells the model to prefer the image when image and OCR text disagree).
  Free-form, edit anything.
- **`field-descriptions.json`** — per-field `description` overlay
  attached to each property in the strict-mode JSON Schema. Keys must
  match the SDPR template's `field_key`s exactly. Set a value to `""` to
  drop that field's description.

## Pre-flight (run once at the start of the session)

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/preflight-hybrid.ts gpt-5.2
```

Checks env vars, DI prebuilt-layout reachability + markdown round-trip,
the gpt-5.2 deployment + vision + strict-mode round-trip, dataset
registration, and the seeded SDPR template's `field_schema`. Resolve any
failures before the first paid call.

## Run a single sample

Default: `synth-full (1)` — synth samples are typed and clean, ideal
for prompt tuning. Default deployment for E08: `gpt-5.2`.

```bash
cd apps/temporal
ITERATION_DIR=$(pwd)/../../experiments/results/08-vlm-ocr-hybrid-gpt-5.2/iteration \
  npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "synth-full (1)" gpt-5.2
```

The script:

1. Loads `prompt.md` and `field-descriptions.json` from `ITERATION_DIR`
   (defaults to E05's iteration kit). Override via the env var to point
   at this E08 kit.
2. Calls Azure DI `prebuilt-layout` on the sample image to get
   markdown + layout.
3. Builds the hybrid request: system prompt + image + OCR markdown
   wrapped in `<ocr_text>` delimiters + strict-mode JSON Schema.
4. POSTs a chat-completions request to the Azure OpenAI deployment.
5. Compares predicted to expected, prints a per-field diff, dumps:
   - **`last-layout.json`** — raw DI prebuilt-layout response.
   - **`last-request.json`** — system/user messages + JSON Schema +
     deployment metadata. (Image bytes are summarised, not included.)
   - **`last-response.json`** — raw chat-completions response + parsed
     `{ fields, source_quotes }` + the OCR markdown that was inlined.
   - **`last-diff.md`** — markdown table of matched / mismatched fields,
     including each mismatch's source_quote so you can see what the
     model thought it saw.

Iteration loop:

1. Edit `prompt.md` and/or `field-descriptions.json`.
2. Re-run the script (~10–25 s per sample at gpt-5.2 capacity 100; DI
   ~1–3 s + VLM ~8–22 s).
3. Inspect `last-diff.md`; tune; repeat.

**Iterate on 2–3 samples before the benchmark.** E04's retrospective
documented that iterating on a single sample was a poor proxy for
benchmark performance. Suggested rotation:

- `synth-full (1)` — clean typed numeric tables (stress-tests digit
  reading).
- `manual sample (1)` — handwritten real-form (stress-tests handwriting
  + checkbox detection).
- `1 81` — well-lit real HR form (representative "average" sample).

When prompts are good across the rotation, copy the content of
`prompt.md` and `field-descriptions.json` into the E08 workflow JSON's
`vlmOcrHybrid.extract` activity `parameters` (`documentAnnotationPrompt`,
`fieldDescriptions`, `numericFieldsNullable: true`), then re-seed
(`npm run test:db:reset`) and trigger the full benchmark via the
trigger script (slug `08`).

## Cost note

Per call: DI prebuilt-layout (~$0.01/page) + gpt-5.2 vision per-token.
gpt-5.2 sits between gpt-4o and gpt-5.4 on per-token pricing. Track
actual cost via `last-response.json`'s `usage` counters and the OCR call
duration from `last-layout.json`.
