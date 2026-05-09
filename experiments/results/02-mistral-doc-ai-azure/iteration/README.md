# E02 prompt-iteration kit

Tunable inputs for the Mistral Document AI Foundry extraction:

- **`prompt.md`** — global `document_annotation_prompt` text. Free-form, edit anything.
- **`field-descriptions.json`** — per-field `description` overlay attached to each property in the JSON Schema. Keys must match the SDPR template's `field_key`s exactly. Set a value to `""` to drop that field's description.

Run a single sample (default: `synth-full (3)`):

```bash
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/iterate-mistral-extraction.ts "synth-full (3)"
```

The script prints a per-field diff (predicted vs ground truth) and writes three files into this folder:

- **`last-request.json`** — exactly what was POSTed to Foundry (incl. resolved schema with descriptions and the global prompt).
- **`last-response.json`** — the raw Foundry OCR response.
- **`last-diff.md`** — markdown table of matched / mismatched fields, with metrics (f1, precision, recall, matchedFields).

Loop:

1. Edit `prompt.md` and/or `field-descriptions.json`.
2. Re-run the script (~14 s per sample under the 10 RPM Foundry quota).
3. Inspect `last-diff.md`; tune; repeat.

Once the prompts are good on a couple of representative samples, the same files plug into the activity (the activity reads the same converter and a parameter on the workflow node), and we re-run the full benchmark.
