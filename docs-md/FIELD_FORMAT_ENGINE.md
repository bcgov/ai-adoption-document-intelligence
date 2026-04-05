# Field Format Engine

The field format engine normalizes OCR field values based on user-defined format specifications. It is a pure-function module with no database or Node.js-specific dependencies, located at `apps/temporal/src/field-format-engine.ts`.

## FormatSpec Interface

```ts
interface FormatSpec {
  canonicalize: string;       // required — pipe-separated list of operations
  pattern?: string;           // optional — regex to validate canonicalized value
  displayTemplate?: string;   // optional — output template using # (digit) and A (letter) placeholders
}
```

## API

### `parseFormatSpec(raw: string | null): FormatSpec | null`

Parses a JSON string into a `FormatSpec`. Returns `null` when:
- input is `null` or empty
- input is not valid JSON
- parsed object is missing a `string` `canonicalize` field

### `canonicalize(value: string, spec: FormatSpec): string`

Applies the canonicalization operations defined in `spec.canonicalize` to `value`. Operations are separated by `|` and applied left to right.

**Available operations:**

| Operation       | Behavior                                                                 |
|-----------------|--------------------------------------------------------------------------|
| `digits`        | Strip all non-digit characters                                           |
| `uppercase`     | Convert to upper case                                                    |
| `lowercase`     | Convert to lower case                                                    |
| `strip-spaces`  | Remove all whitespace characters                                         |
| `text`          | Trim, collapse internal whitespace to single space, remove space before `. , ; : ! ?` |
| `number`        | Strip currency symbols (`£ $ € ¥`), commas, and spaces                  |
| `date:FORMAT`   | Parse via `parseToCalendarParts`; output as `YYYY-MM-DD`, `DD/MM/YYYY`, or `MM/DD/YYYY`. Returns original value if unparseable. |
| `noop`          | Pass value through unchanged                                             |

**Example chain:** `"uppercase|strip-spaces"` applied to `" Hello World "` → `"HELLOWORLD"`

### `validate(value: string, spec: FormatSpec): { valid: boolean; message?: string }`

Canonicalizes the value then tests it against `spec.pattern`. Returns `{ valid: true }` when there is no pattern or the canonicalized value is empty.

### `format(value: string, spec: FormatSpec): string`

Canonicalizes the value and applies `spec.displayTemplate`. In the template:
- `#` is a digit placeholder
- `A` is a letter placeholder
- All other characters are literal separators

If the number of placeholders does not equal the canonicalized value length, the canonicalized value is returned without applying the template.

**Example:** `canonicalize: "digits"`, `displayTemplate: "###-###-###"` applied to `"123456789"` → `"123-456-789"`

## Usage Example

```ts
import { parseFormatSpec, canonicalize, validate, format } from "./field-format-engine";

const spec = parseFormatSpec('{"canonicalize":"digits","pattern":"^\\d{9}$","displayTemplate":"###-###-###"}');

if (spec) {
  const canonical = canonicalize("123-456-789", spec);   // "123456789"
  const result = validate("123-456-789", spec);          // { valid: true }
  const display = format("123-456-789", spec);           // "123-456-789"
}
```

## AI Format Suggestion

The `FormatSuggestionService` (`apps/backend-services/src/template-model/format-suggestion.service.ts`) analyzes HITL correction patterns and recommends format specs via Azure OpenAI.

### Endpoint

```
POST /api/template-models/:id/suggest-formats
```

Returns an array of `FormatSuggestion` objects:

```ts
interface FormatSuggestion {
  fieldKey: string;
  formatSpec: { canonicalize: string; pattern?: string; displayTemplate?: string };
  rationale: string;
  sampleCount: number;
}
```

### Data Gathering

The service gathers error data from HITL corrections:

1. Loads the template model's field definitions (field keys, types, existing format specs)
2. Queries `FieldCorrection` records where `action = corrected`, joined through `ReviewSession -> Document`, filtered by the template model's `group_id` and field keys
3. Samples up to 200 most recent corrections, grouped by field key

### AI Analysis

The gathered data is sent to Azure OpenAI (same configuration as the OCR improvement pipeline: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`). The AI:

- Skips fields that already have a `format_spec`
- Skips fields with too few corrections to identify a pattern
- Skips free-text fields with no consistent format
- Returns an empty array when no suggestions can be made

### Limitations

- Currently only uses HITL correction data. Benchmark run mismatch data is not yet integrated (TODO).
- Suggestions are recommendations; they are not automatically applied to field definitions.
