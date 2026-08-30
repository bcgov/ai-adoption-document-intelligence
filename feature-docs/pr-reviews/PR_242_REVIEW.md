# Can I approve PR #242 as-is?

**Not yet — one blocking code fix, then approve. Everything else is fine.** — A single-character OCR read on any `applicant_*` / `spouse_*` STRING field (spouse_name, spouse_signature) is silently rewritten to "0" by the new `singleCharacterToZero` coercion, and those fields are explicitly excluded from the review criteria, so the corrupted value is never shown to a human. Reproduced against the exact seeded SDPR schema and the exact template config this PR ships. CI is also red on Biome formatting in two workspaces, which blocks merge regardless.

## Background

PR #242 (kmandryk, AI-1287) moves the offline Python post-processing behind the SDPR V2
OCR performance report into the product. It adds two Temporal activities —
`hitl.applyReviewCriteria` (per-field, prediction-only review/skip rules) and
`document.persistReviewPlan` (writes the plan to a new `Document.review_plan` JSONB
column) — replacing whole-document confidence gating with field-level gating. The HITL
review workspace now defaults to showing only flagged fields with the reason. It also
extends `ocr.normalizeFields` with a `singleCharacterToZero` coercion, gives the schema-
aware evaluator `canonicalize` and `maxEdits` fuzzy matching, and rewires the SDPR
operational template to end in a simulated ICM handoff. 48 files, +6507/-148, of which
~2700 lines are two markdown reports at repo root.

## Your call — 2 decisions

**Is 'a single-character income read becomes $0, with no human review' a policy SDPR has actually agreed to?**
This one is deliberate and measured — the flip counts are in
SDPR_V2_WORKFLOW_ALIGNMENT.md, and the unit test asserts income "7" becomes "0". But the
review rule then adds `skipWhen: predictionLengthAtMost: 1`, so a coerced value is
explicitly excluded from review. Net effect: a genuine $7 income and a stray checkbox
glyph both become $0 and neither reaches a reviewer. That changes a benefit calculation.
It is a program decision, not an engineering one — but the code is a fine place to hold
it once someone at SDPR has said yes.
  - Confirmed with SDPR — ship as-is
  - Ship but flag coerced fields for review (drop the predictionLengthAtMost skipWhen)
  - Hold the coercion until SDPR signs off

**Should IMPLEMENTATION_BRIEF.md and SDPR_OCR_Performance_Report_V2.md live at repo root?**
2,692 lines of markdown at the top level, and .gitignore was amended to un-ignore the V2
report specifically. I scanned both for PII — clean, all identifiers are fabricated
(999-888-777) and there are no names or emails. So it is purely a placement question
against the docs-md taxonomy, not a safety one. Not blocking either way.

## Chores

- [ ] (**you**) Ask Kaegan to scope singleCharacterToZero to number-typed fields only — One-line template fix or a three-line activity fix — see finding 1. This is the only thing standing between the PR and approval.
- [ ] (**you**) Ask Kaegan to run `npx @biomejs/biome check --write` in apps/backend-services and apps/temporal — Backend QA fails on one stray whitespace line in hitl-responses.dto.ts:80; Temporal QA fails on 5 formatting diffs in the new test files. Mechanical.
- [x] (agent) Verified the diff, ran the PR's own test suites, reproduced finding 1 — 115 tests pass across hitl-apply-review-criteria, persist-review-plan, ocr-normalize-fields and selection-mark. Migration is additive, nullable, and correctly ordered after develop's latest.

## What is actually in it

### 1. singleCharacterToZero rewrites spouse_name and spouse_signature to "0" — and no rule ever flags them for review  — _BLOCKING — confirmed by repro against the shipped schema + shipped template config_

The scope resolver falls back to a key-name regex whenever the field is not number-
typed. That regex, `^(?:applicant|spouse)_[a-z0-9_]+$`, matches far more than income: in
the seeded SDPR schema it also matches spouse_name (string), spouse_signature (string),
spouse_date (date), spouse_phone and spouse_sin. The template sets
`singleCharacterToZero: true` with a documentType and NO explicit allowlist, so the
fallback is the live path.  Blast radius: the review criteria exclude `*_name` and
`*_signature` from the income gate and have no other rule for them, with `defaultAction:
"skip"`. So spouse_name = "0" is never flagged, `requiresReview` stays false for that
field, the switch routes straight past the human gate to the ICM handoff, and
storeResults persists it. spouse_sin and spouse_phone are rescued by the format-
validation rule; the name and signature fields are not.  Why the tests missed it: the
one test that proves string fields are safe uses the field key `name`, which is the
single string field in the SDPR schema that does NOT match the regex. `spouse_name`
does.  Fix, cheapest first: (a) add `"singleCharacterToZeroFields": [...the 34 income
keys]` to the template's normalizeFields parameters — the allowlist branch bypasses the
heuristic entirely and is already tested; or (b) in `isSingleCharacterToZeroInScope`,
only fall back to the key regex when no field schema was loaded. (b) is the better fix
and also removes the `applicant_`/`spouse_` SDPR naming from a generic shared activity,
which the project CLAUDE.md rule against document-specific implementation asks for.

`apps/temporal/src/activities/ocr-normalize-fields.ts:78-101`
```ts
/** Field keys following the SDPR income-field naming convention (`applicant_*` / `spouse_*`). */
const INCOME_LIKE_FIELD_KEY = /^(?:applicant|spouse)_[a-z0-9_]+$/i;

function isSingleCharacterToZeroInScope(
  fieldKey: string,
  schemaFieldType: string | undefined,
  fieldSet: Set<string> | null,
): boolean {
  if (fieldSet) return fieldSet.has(fieldKey);
  if (schemaFieldType === "number") return true;
  return isIncomeLikeFieldKey(fieldKey);   // <-- string fields land here
}
```
spouse_name is field_type 'string', so it falls past the number check into the regex and
matches.

`apps/temporal/src/activities/zz-repro.test.ts (scratch, not committed):run output`
```text
OUTPUT: {"spouse_name":"0","spouse_signature":"0","name":"J"}
CHANGES: [
  {"fieldKey":"spouse_name","originalValue":"J","correctedValue":"0","reason":"Income single-character coerced to 0"},
  {"fieldKey":"spouse_signature","originalValue":"S","correctedValue":"0","reason":"Income single-character coerced to 0"}
]
```
Ran through the PR's own test harness with the seeded SDPR field schema and the
template's exact parameters. `name` survives; `spouse_name` does not.

`docs-md/workflows/templates/standard-ocr-workflow-sdpr.json:695-699`
```json
"parameters": {
  "documentType": "seed-sdpr-monthly-report-template",
  "singleCharacterToZero": true
}
```
No singleCharacterToZeroFields allowlist, so the key-name heuristic is what actually
runs in production.

### 2. CI is red on both backend and temporal — Biome formatting only  — _BLOCKING to merge, trivial to fix_

Backend Quality Assurance fails on a single stray-whitespace line the diff introduced at
hitl-responses.dto.ts:80. Temporal Quality Assurance fails on 5 formatting diffs across
schema-aware-evaluator.test.ts and selection-mark.test.ts. `npx @biomejs/biome check
--write` in each workspace clears both. Frontend QA, CodeQL, wiki validation and
Dockerfile checks all pass. PR mergeStateStatus is BLOCKED as a result.

`apps/backend-services/src/hitl/dto/hitl-responses.dto.ts:78-81`
```diff
 export class SessionDocumentDto {
   @ApiProperty()
   id!: string;
-
+  
   @ApiProperty()
   original_filename!: string;
```
That is the whole backend CI failure — trailing whitespace on one line.

### 3. A field with no confidence value is never flagged, and defaultAction is skip  — _Worth knowing, not blocking_

`confidenceBelow` returns false when `ctx.confidence === null`, so a field the model
returned without a confidence score cannot match any confidence rule. With
`defaultAction: "skip"` and only three rules covering income/sin/phone, everything else
falls through to skip and the document routes past the human gate. That is a reasonable
default for a first cut, and it is documented, but it means the safety of this workflow
rests entirely on Azure always populating confidence. Worth a catch-all rule for null-
confidence fields later — not now.

### 4. The template still stores OCR results AFTER the human gate — your existing open question, unchanged  — _Pre-existing, not introduced here_

The graph runs persistReviewPlan -> reviewSwitch -> humanGate -> icmHandoff ->
storeResults. `ocr.storeResults` is what writes the OcrResult row, so a document sitting
at the gate still has no persisted OCR result for the review workspace to render.
develop's template has the same ordering, so this PR neither causes nor fixes it — but
it does mean the new flagged-only review UI cannot actually be exercised on this
template until that ordering is settled. This is the open question already recorded in
the store about seeded workflow templates persisting OCR before the gate. Not a reason
to hold the PR; a reason not to call it demo-ready yet.

### 5. Everything else in the diff is clean  — _Merge as-is_

Migration `20260729140000_add_document_review_plan` is a single additive nullable JSONB
column, correctly ordered after develop's latest (20260630000000). `persistReviewPlan`
follows the audit rule correctly — best-effort audit after a successful commit, failures
logged not thrown — and groupId reaches it via the runner's tenant injection, so the
audit row is scoped. `HitlService` validates the JSON column shape before returning it
rather than trusting the DB. The frontend defaults to flagged-only per session and has
an explicit 'Show all fields' escape hatch. The evaluator's `canonicalize` and
`maxEdits` changes are symmetric across GT alternates and well tested. Swagger DTOs are
properly typed. The seed adds formatSpecs to the SDPR field schema — worth noting in the
PR description that this only takes effect on reseed. 115 tests pass across the four
new/changed suites.

## Links

- [PR #242](https://github.com/bcgov/ai-adoption-document-intelligence/pull/242) — 48 files, +6507/-148, base develop
- [AI-1287](https://citz-do.atlassian.net/browse/AI-1287) — the ticket
- [Backend QA failure](https://github.com/bcgov/ai-adoption-document-intelligence/actions/runs/31028828279/job/92384047365) — Biome, 1 error
- [Temporal QA failure](https://github.com/bcgov/ai-adoption-document-intelligence/actions/runs/31028828299/job/92384047809) — Biome, 5 errors
- [commit a2b6cbd](https://github.com/bcgov/ai-adoption-document-intelligence/commit/a2b6cbd984049180723f215aea9390b9b000d852) — the feature commit
- [commit 8e093ac](https://github.com/bcgov/ai-adoption-document-intelligence/commit/8e093acc639c668aacc3f759bf0b39dcdb16ca82) — P0 rule sizing + test hardening

## What I checked

- Computed the true diff via git merge-tree rather than trusting the PR page; every one of the 48 paths accounted for
- Reproduced finding 1 by running the PR's own jest harness against the seeded SDPR field schema
- Ran the four new/changed temporal test suites — 115 pass
- Scanned both root-level markdown reports for SINs, emails, names and claimant data — clean
- Checked migration ordering against develop's latest migration
- Confirmed groupId reaches persistReviewPlan via runner tenant injection, so the audit row is not untenanted
- Compared the workflow template's edge ordering against develop to separate new behaviour from pre-existing

