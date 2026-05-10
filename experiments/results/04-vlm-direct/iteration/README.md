# E04 prompt-iteration kit (VLM-direct, Azure OpenAI chat completions)

Tunable inputs for the VLM-direct extraction:

- **`prompt.md`** — global instruction text. Sent as the chat-completions
  `system` message preamble (alongside a short directive that asks for
  source quotes). Free-form, edit anything.
- **`field-descriptions.json`** — per-field `description` overlay attached
  to each property in the strict-mode JSON Schema. Keys must match the
  SDPR template's `field_key`s exactly. Set a value to `""` to drop that
  field's description.

The iteration kit is copy-pasted from E03 (Azure CU) on day one — the
SDPR-form quirks (column conventions, blank-vs-zero, signature-vs-name)
are engine-agnostic, so the descriptions transfer verbatim. Only the
schema wrapper changes (CU's analyzer schema → OpenAI's
`response_format.json_schema`).

## Pre-flight (run once at the start of the session)

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/preflight-vlm.ts gpt-5.4
```

This checks env vars, deployment reachability + vision capability +
strict-mode round-trip on a 1×1 PNG, dataset registration, and the
seeded SDPR template's `field_schema`. Resolve any failures before the
first paid call.

## Run a single sample

Default: `synth-full (1)` — synth samples are typed and clean, ideal for
prompt tuning. Default deployment: `gpt-5.4`.

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/iterate-vlm-extraction.ts "synth-full (1)" gpt-5.4
```

The script:

1. Loads `prompt.md` and `field-descriptions.json`.
2. Builds the strict-mode JSON Schema from the seeded SDPR template +
   the editable prompt + field descriptions. Each field has a sibling
   `source_quotes.<field_key>` slot that the model must populate.
3. POSTs a chat-completions request (one image + system prompt + user
   prompt + `response_format: { type: "json_schema", strict: true }`)
   to the Azure OpenAI deployment.
4. Compares predicted to expected, prints a per-field diff, dumps:
   - **`last-request.json`** — system/user messages + JSON Schema +
     deployment metadata. (Image bytes are summarised, not included.)
   - **`last-response.json`** — raw chat-completions response + parsed
     `{ fields, source_quotes }`.
   - **`last-diff.md`** — markdown table of matched / mismatched fields,
     including each mismatch's source_quote so you can see what the
     model thought it saw.

Iteration loop:

1. Edit `prompt.md` and/or `field-descriptions.json`.
2. Re-run the script (~10–25 s per sample at gpt-5.4 capacity 100).
3. Inspect `last-diff.md`; tune; repeat.

Hallucination guard: empty `source_quote` for a populated field is the
strongest signal that the model hallucinated a value. Watch the
`source_quote` column in `last-diff.md` for fields whose value looks
plausible but whose quote is empty or generic — those are the candidates
for tightening descriptions, not for accepting as correct.

When the prompts are good on a couple of representative samples, copy
the content of `prompt.md` and `field-descriptions.json` into the
workflow JSON's `vlmDirect.extract` activity `parameters`
(`documentAnnotationPrompt`, `fieldDescriptions`, `numericFieldsNullable:
true`), then re-seed (`npm run test:db:reset`) and trigger the full
benchmark via the trigger script.

## Cost note

gpt-5.4 with vision input bills ~ $X/M input tokens + $Y/M output
tokens. A 200-DPI form image at the default 8K max-completion budget is
roughly 10–20K input + 1–2K output tokens per call ≈ $0.05–$0.20 per
sample. 40 samples per run, ~5–10 iterations to land production-grade
prompts. Track the actual cost via `last-response.json`'s `usage`
counters.
