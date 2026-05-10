# E05 prompt-iteration kit (VLM + OCR hybrid)

Tunable inputs for the VLM + OCR hybrid extraction:

- **`prompt.md`** — global instruction text. Sent as the chat-completions
  `system` message preamble (alongside a hybrid-specific paragraph that
  tells the model to prefer the image when image and OCR text disagree).
  Free-form, edit anything.
- **`field-descriptions.json`** — per-field `description` overlay
  attached to each property in the strict-mode JSON Schema. Keys must
  match the SDPR template's `field_key`s exactly. Set a value to `""` to
  drop that field's description.

The iteration kit is copy-pasted from E04 (VLM-direct) on day one — the
SDPR-form quirks (column conventions, blank-vs-zero, signature-vs-name)
are engine-agnostic, so the descriptions transfer verbatim. Only the
schema wrapper and prompt assembly change (E04 sends image alone; E05
sends OCR markdown + image with a "trust the image" instruction).

## Pre-flight (run once at the start of the session)

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/preflight-hybrid.ts gpt-5.4
```

Checks env vars, DI prebuilt-layout reachability + markdown round-trip,
the gpt-5.4 deployment + vision + strict-mode round-trip, dataset
registration, and the seeded SDPR template's `field_schema`. Resolve any
failures before the first paid call.

## Run a single sample

Default: `synth-full (1)` — synth samples are typed and clean, ideal
for prompt tuning. Default deployment: `gpt-5.4`.

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "synth-full (1)" gpt-5.4
```

The script:

1. Loads `prompt.md` and `field-descriptions.json`.
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
2. Re-run the script (~12–28 s per sample at gpt-5.4 capacity 100; DI
   ~1–3 s + VLM ~10–25 s).
3. Inspect `last-diff.md`; tune; repeat.

**Iterate on 2–3 samples before the benchmark.** E04's retrospective
documented that iterating on a single sample was a poor proxy for
benchmark performance (synth-full(1) was unusually hard for VLM-direct
gpt-5.4, dragging the iteration metric down without predicting the
benchmark median). Suggested rotation:

- `synth-full (1)` — clean typed numeric tables (stress-tests digit
  reading).
- `manual sample (1)` — handwritten real-form (stress-tests handwriting
  + checkbox detection).
- `1 81` — well-lit real HR form (representative "average" sample).

When prompts are good across the rotation, copy the content of
`prompt.md` and `field-descriptions.json` into the workflow JSON's
`vlmOcrHybrid.extract` activity `parameters` (`documentAnnotationPrompt`,
`fieldDescriptions`, `numericFieldsNullable: true`), then re-seed
(`npm run test:db:reset`) and trigger the full benchmark via the
trigger script.

## Cost note

Per call: DI prebuilt-layout (~$0.01/page) + gpt-5.4 vision (~$0.05–0.20
per sample). 40 samples per benchmark, ~5–10 iterations during prompt
tuning. Track actual cost via `last-response.json`'s `usage` counters
and the OCR call duration from `last-layout.json`.
