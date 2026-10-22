# PR #242 — a walkthrough

**[Feature/sdpr v2 report workflow](https://github.com/bcgov/ai-adoption-document-intelligence/pull/242)** · [AI-1287](https://citz-do.atlassian.net/browse/AI-1287) · Kaegan Mandryk · 48 files, +6,507 / −148 · base `develop`

This is the companion to [PR_242_REVIEW.md](PR_242_REVIEW.md). That file answers *"can I approve
it"*. This one answers *"what actually changed, and was it the right way to do it"* — written to
be read start to finish without opening the diff.

---

## 1. What this PR is, in a paragraph

For the last few months the SDPR OCR numbers in the performance report have not been produced by
the product. They have been produced by a set of **offline Python scripts** — a person exports a
benchmark run to CSV, runs a normalisation script over it that fixes up format differences and
recovers mis-read zeros, and the corrected numbers go in the report. The product itself, if you
ran a document through it, would score worse than the report claims, because the product does not
do any of that post-processing.

PR #242 closes that gap. It takes the rules that lived in those scripts and moves them into the
workflow the product actually runs — as real graph nodes, with real config, wired into the SDPR
operational template. It also replaces the crude "is this whole document confident enough?" gate
in front of human review with a **per-field rule engine**, and gives the reviewer a screen that
shows only the fields that were flagged, with the reason each one was flagged.

So there are really two things in the box, and they're related but separable:

1. **Reproduce the report inside the product** — normalisation, zero-recovery, evaluator scoring.
2. **Field-level human-review gating** — decide per field, not per document, who needs a human.

---

## 2. Why this exists — the context that makes it make sense

This matters because without it the PR reads like a pile of clever rules with no argument behind
them.

The SDPR Monthly Report is a handwritten form. Caseworkers currently key every field of every one
by hand. The pilot's whole proposition is *OCR plus human review is cheaper than keying it all* —
and the pushback the [V2 performance report](../../SDPR_OCR_Performance_Report_V2.md) was written
to answer was, roughly, *if a human has to check everything anyway, what have you saved?*

The report's answer, in its own words: the comparison is **OCR plus HITL versus the current
state**, not OCR plus HITL versus perfect automation. And the way you make that comparison
favourable is by shrinking what the human has to look at. HITL — human-in-the-loop — is the
review step where a person confirms or corrects what the machine read.

Two findings from the report drive this PR's design directly:

- **Confidence scores are not a reliable trigger on handwriting.** A field can come back at 99%
  confidence and still be wrong. So gating on "document confidence below X" is close to
  meaningless — it flags the wrong things and misses the right ones.
- **The cost of review scales with what you route to it.** Report §10.5 sizes this precisely: at
  a 90% error-recall target, gating income and SIN separately costs **149 field reviews per 100
  documents** and lets 8.1 errors per 100 docs through. Gate the whole document instead and you
  are reviewing all 90-odd fields on every flagged form.

That second number is where the field-level rule engine comes from. It is not an abstraction
exercise — it's the mechanism that makes the pilot's economics work.

**One piece of scope context worth holding.** Loren ruled on 2026-08-04 that ICM integration is
out of Phase 1 — Phase 1 establishes confidence in the value, Phase 2 *might* carry integration,
conditional on Phase 1 evidence. That is exactly why the new workflow ends in a node labelled
"Build Simulated ICM Handoff Payload" that assembles a JSON object and sends it nowhere. That's
the right call for where the project is, not a shortcut.

---

## 3. The one big idea

Everything else follows from this shape change:

```
BEFORE                                    AFTER
─────────                                 ─────────
ocr.checkConfidence                       hitl.applyReviewCriteria
  ↓ "is the document's average             ↓ "for each of ~90 fields, do the
     confidence below 0.8?"                    rules say review or skip?"
  ↓                                        ↓
requiresReview: true/false                reviewPlan: [{field, decision, reason}, …]
                                          requiresReview: any field says review
  ↓                                        ↓
reviewSwitch → humanGate                  reviewSwitch → humanGate
  ↓                                        ↓
reviewer sees all 90 fields               reviewer sees the 4 flagged ones,
                                          each with the reason it was flagged
```

The rest of the PR is the machinery to make that work, plus the report-reproduction rules that
came along for the ride.

---

## 4. The changes, group by group

### A. The rule engine — `hitl.applyReviewCriteria`

**File:** [hitl-apply-review-criteria.ts](../../apps/temporal/src/activities/hitl-apply-review-criteria.ts) (407 lines, new)
**Docs:** [HITL_REVIEW_CRITERIA.md](../../docs-md/architecture/HITL_REVIEW_CRITERIA.md)

A new Temporal activity — a step a workflow graph can call as a node. It walks every field in an
OCR result and evaluates an ordered list of rules against each one. First rule that matches wins;
if nothing matches, a `defaultAction` applies.

A rule looks like this (this one is real, from the SDPR template):

```json
{
  "name": "income-confidence-gate",
  "select": {
    "fieldPatterns": ["applicant_*", "spouse_*"],
    "excludeFieldPatterns": ["*_name", "*_sin", "*_phone", "*_date", "*_signature"],
    "fieldTypes": ["number"]
  },
  "when":     [{ "confidenceBelow": 0.96 }],
  "skipWhen": [{ "predictionIsBlank": true }, { "predictionLengthAtMost": 1 }],
  "action": "review",
  "reason": "low-confidence income value"
}
```

Read it as: *for number-typed fields whose key starts `applicant_` or `spouse_` but isn't a name,
SIN, phone, date or signature — if confidence is under 0.96, send it to a human, unless the value
came back blank or one character long.*

Three design choices here are worth naming, because they're the ones that make it reusable:

**It never sees ground truth.** Every condition reads the prediction only — the value, its
confidence, and static schema metadata. There is no parameter slot for the correct answer. That
means the identical rules produce the identical plan in production (where no correct answer
exists) and in benchmarking (where one does but must be off-limits). It's a small constraint that
buys a lot: you can trust that a benchmark number about review load is the review load you'd
actually get.

**All the SDPR-ness lives in config, not code.** The activity itself doesn't know what an income
field is. Which fields matter, what thresholds apply, what counts as review-worthy — all of it is
in the `rules` array in the workflow JSON. This is the repo's standing rule ("the system is
generic and must support arbitrary workloads") honoured properly.

**The thresholds are separately overridable.** There's a `ruleConfidenceOverrides` map keyed by
rule *name*, so you can move an operating point — say from the 90%-recall threshold of 0.96 to
the 95% one of 0.97 — without editing the rules array. That matters because choosing the
operating point is explicitly a business decision for SDPR leadership, and this is the knob they'd
turn. The template currently sets income at 0.96 and SIN at 0.90, which is the 90%-recall row of
the report's ladder.

### B. Storing the plan — `document.persistReviewPlan`

**Files:** [persist-review-plan.ts](../../apps/temporal/src/activities/persist-review-plan.ts) (129 lines, new), [migration](../../apps/shared/prisma/migrations/20260729140000_add_document_review_plan/migration.sql), [schema.prisma](../../apps/shared/prisma/schema.prisma)

The plan has to survive from the workflow into the UI, so there's a new nullable JSONB column on
`documents`:

```sql
ALTER TABLE "documents" ADD COLUMN "review_plan" JSONB;
```

Additive, nullable, no backfill, correctly ordered after develop's latest migration. About as safe
as a schema change gets.

The activity writes the plan and then records an audit event, deliberately *outside* the write —
if audit fails it logs and moves on rather than failing the document. That's the pattern the
project's audit rules ask for (audit-after-commit, best effort) and it's applied correctly here.
The tenant `groupId` reaches it via the graph runner's tenant injection rather than the node
config, so the audit row is properly scoped.

### C. The reviewer's screen

**File:** [ReviewWorkspacePage.tsx](../../apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx)

When a session loads with a review plan that flags at least one field, the field list defaults to
showing only the flagged fields, and each carries its reason inline:

```tsx
{reviewPlanByField.get(field.fieldKey)?.decision === "review" && (
  <Text size="xs" c="orange" fs="italic">
    🚩 {reviewPlanByField.get(field.fieldKey)?.reason}
  </Text>
)}
```

There's a "Show all fields" toggle, and sessions without a plan behave exactly as before. The
filter composes with the existing text search rather than replacing it.

This is the part that turns the rule engine into actual saved minutes: 4 fields on screen instead
of 90, each labelled with *why you're looking at it*. Showing the reason is the detail I'd single
out — it's the difference between "check this" and "check this because the format doesn't match",
and it's what lets a reviewer move fast.

### D. Normalisation — `singleCharacterToZero`

**File:** [ocr-normalize-fields.ts](../../apps/temporal/src/activities/ocr-normalize-fields.ts)

The SDPR income table has a "no income for this category" indicator. Azure sometimes reads it as a
stray single character — a tick, a slash, a lone digit — rather than as a zero. The offline
Python had two rules for this (`income-single-char-zero` and `income-single-digit-to-zero`), and
between them they accounted for **126 of the 356 cell corrections** in the audit CSV. That's 35%
of the entire gap between what the product scores and what the report claims. It's the single
biggest item in the port.

So the new option coerces any field value that ends up one character long to `"0"`.

**This is where the PR's one real defect lives**, and it's worth understanding *how* it got there
because it's an instructive failure. The offline rules were named `income-single-*` and were
scoped to the income columns of the table. The ported version resolves scope like this:

```ts
if (fieldSet) return fieldSet.has(fieldKey);      // explicit allowlist
if (schemaFieldType === "number") return true;    // number-typed fields
return isIncomeLikeFieldKey(fieldKey);            // else: /^(applicant|spouse)_.../
```

That last fallback is wider than the rule it replaced. `applicant_*` / `spouse_*` covers the 34
income fields — but in the seeded schema it also covers `spouse_name`, `spouse_signature`,
`spouse_date`, `spouse_phone` and `spouse_sin`. And the template enables the option with no
allowlist, so the fallback is the live path. A handwritten spouse name that OCRs to a single
glyph becomes `0`, the review criteria explicitly exclude `*_name` and `*_signature`, and the
document routes past the human gate with the corruption in it.

I confirmed this by running the PR's own test harness against the real seeded schema:

```
OUTPUT:  {"spouse_name":"0", "spouse_signature":"0", "name":"J"}
```

The fix is small — either an explicit field allowlist in the template, or don't fall back to the
key regex when a schema was loaded. The second is better because it also removes SDPR field naming
from a shared generic activity. Full detail in [the review](PR_242_REVIEW.md) and in the
[PR comment](https://github.com/bcgov/ai-adoption-document-intelligence/pull/242#issuecomment-5195645024).

### E. The evaluator — scoring, not processing

**File:** [schema-aware-evaluator.ts](../../apps/temporal/src/evaluators/schema-aware-evaluator.ts)

Worth being clear that this is a *different kind* of change from the rest. The evaluator doesn't
touch production documents at all — it's the benchmarking component that compares a prediction
against ground truth and produces the accuracy numbers. Changes here move the *scores*, not the
data.

Three additions:

- **`canonicalize`** — applies a format transform symmetrically to both the prediction and every
  ground-truth alternative before comparing. So `999 888 777` and `999-888-777` compare equal on a
  SIN without either side being "wrong". Diagnostics still report the original values so mismatch
  reports stay readable, which is a nice touch.
- **`maxEdits` / `minLength`** — a second, independent fuzzy-match path. The existing one uses a
  *ratio* (how similar as a fraction), which behaves badly on short strings: `Lee` vs `Lei` is one
  typo but scores 0.667, below the 0.8 threshold. The new path says "match if the edit distance is
  ≤ 2 **and** the shorter string is at least 3 characters", so short-name typos match without
  `Al` and `Ed` matching just for being short. Accounts for the `name-fuzzy` (26 cells) and
  `freeform-fuzzy` (20 cells) rules from the audit.
- **[selection-mark.ts](../../apps/temporal/src/selection-mark.ts)** — normalises Azure's tagged
  `:selected:` / `:unselected:` checkbox syntax in ground truth at load time, so checkbox fields
  don't mismatch on serialisation punctuation.

### F. The workflow template

**File:** [standard-ocr-workflow-sdpr.json](../../docs-md/workflows/templates/standard-ocr-workflow-sdpr.json)

The rewiring, end to end:

```
prepare → submit → poll → extract
  → recoverNumericZeros      (PR #169 — checkbox-as-zero)
  → normalizeFields          (NEW in the chain: format specs + singleCharacterToZero)
  → postOcrCleanup
  → reviewCriteria           (NEW — replaces ocr.checkConfidence)
  → persistReviewPlan        (NEW)
  → reviewSwitch ──requiresReview──→ humanReview ─┐
                 └──────default──────────────────→ icmHandoff → storeResults → done
```

Note the switch has a second condition beyond `requiresReview`: it also checks the document ID
doesn't start with `benchmark-`. Benchmark runs never stop at a human gate, which is what you
want — but it's worth knowing that the benchmark path and the production path diverge at exactly
the point the review plan is used.

### G. Seed field schemas

**File:** [seed.ts](../../apps/shared/prisma/seed.ts) (+217/−36)

Adds `formatSpec` entries to the SDPR template's field schema — `digits` + `^\d{9}$` for SIN,
`^\d{10}$` for phone, `date:YYYY-MM-DD` for dates, `strip-spaces|uppercase` for case ID,
`number` for the 34 income fields, `text` for free-text. These are what the normalisation and the
`formatValidationFails` review condition both read.

**Rollout note that isn't in the PR description:** these only take effect on a reseed. An
environment with existing seeded data keeps the old schema and the format-validation rule silently
matches nothing.

### H. Two large documents at repo root

[SDPR_OCR_Performance_Report_V2.md](../../SDPR_OCR_Performance_Report_V2.md) (1,865 lines) and
[IMPLEMENTATION_BRIEF.md](../../IMPLEMENTATION_BRIEF.md) (827 lines). `.gitignore` was amended to
un-ignore the V2 report specifically, with a comment saying it's an intentional source of truth.

I scanned both for anything sensitive — SINs, names, emails, claimant data. Clean. Every identifier
in them is fabricated (`999-888-777`), and the numbers are all aggregates.

Placement is the only question, and it's a mild one. Given the report is currently the *only*
measured value evidence that exists for the SteerCo executive presentation, having it version-
controlled next to the code that reproduces it is defensible. It just doesn't match the
`docs-md/` taxonomy the rest of the repo follows.

### I. The small stuff

- [`data-transform/execute.ts`](../../apps/temporal/src/activities/data-transform/execute.ts) —
  adds `documentId` to the known-params set so a raw document ID isn't parsed as a JSON payload.
  Needed because the ICM handoff node is a `data.transform`.
- `review_plan: null` added to document-creation call sites in two backend services — mechanical,
  follows from the schema change.
- Registry entries in four places (temporal + backend, activity registry + parameter schema
  registry) so the new activities validate properly in the workflow designer.
- Swagger DTOs for the new `reviewPlan` field on the session response, properly typed.

---

## 5. What I think of the approach

### What's well judged

**Field-level gating is the right unit, and the config/code split is right.** The activity has no
document knowledge; the SDPR-ness is entirely in the template JSON. That's the difference between
something that ports to the next ministry and something that doesn't. It also means the operating
point — the thing SDPR leadership actually has to decide — is a number in a config file rather
than a code change, which is exactly where you want a business decision to live.

**The prediction-only constraint is the best decision in the PR.** It would have been so easy to
let the review criteria peek at ground truth during benchmarking to get better numbers. Refusing
that — structurally, with no parameter slot for it — means the review-load figures in the report
are the review load you'd actually see in production. A lot of benchmark work quietly loses that
property.

**Showing the reason in the UI.** Small change, disproportionate effect on whether the reviewer is
fast.

**The paper trail.** [SDPR_V2_WORKFLOW_ALIGNMENT.md](../../docs-md/extraction/SDPR_V2_WORKFLOW_ALIGNMENT.md)
counts every offline rule, says how many cells each one flipped, and dispositions it as *port to
workflow*, *port to evaluator*, or *drop with the cost stated*. Two rules are explicitly dropped
with their cost named (9 cells). That's the kind of accounting that lets someone six months from
now tell whether a number moved because the engine improved or because a rule changed — and it
includes a PII-safe command to regenerate the counts. Genuinely good practice.

**Every coercion is recorded.** Each value the normaliser changes gets a `changes` entry with the
original, the new value and the rule name. Silent data modification with an audit trail is a very
different animal from silent data modification.

### What I'd push back on

**One rule got wider on the way in.** The offline Python scoped the single-character coercion to
income columns; the port scopes it by key prefix and catches names and signatures too. This is the
blocker, and the general lesson is worth more than the specific bug: when you port a rule from an
analysis script to production, the *scope* is part of the rule. It's easy to carry the transform
across faithfully and quietly widen what it applies to.

**And the test that should have caught it picked the one safe example.** The test asserting string
fields are untouched uses the key `name` — the single string field in the SDPR schema that doesn't
match the regex. Not carelessness; it's the standard failure mode of writing the test from the
code you just wrote rather than from the data you'll run it against. A test built from the actual
seeded schema would have failed immediately.

**Two safety mechanisms overlap in a way nobody designed.** The normaliser turns a single character
into `0`; the review rule then skips anything one character long (`predictionLengthAtMost: 1`).
Individually both are reasoned and evidenced. Composed, they mean *no single-character income read
ever reaches a human* — the value is rewritten and then excluded from review for being short.
That's 126 cells in the audit, so it's material, and it's the sort of interaction that's invisible
unless you read the normaliser config and the review config together. The report does argue for it
explicitly in §10.5, so it's a deliberate position — but it's a position about how a benefit gets
calculated, and it deserves to be signed off as one rather than inherited from a benchmark
methodology.

**Everything unmatched skips, and unknown confidence never matches.** `defaultAction` is `"skip"`,
three rules cover income / SIN / phone, and `confidenceBelow` returns false when confidence is
absent. So a field arriving with no confidence score falls straight through to skip. That's a
reasonable first cut and it's documented — the report is explicit that the other categories are
covered by non-confidence safety layers instead. But it means the safety of this workflow rests on
Azure always populating confidence, which is an assumption worth writing down somewhere it'll be
seen.

**The PR body undersells the risk surface.** No Testing section, and the reseed precondition isn't
mentioned. For a change that rewrites extracted values in a benefits pipeline, the description
reads more like a feature summary than a change with a blast radius.

### The thing this PR can't fix on its own

The template still runs `storeResults` **after** the human gate — unchanged from develop, so not
this PR's doing. But it means a document sitting at the gate has no persisted OCR result, and the
review workspace has nothing to render. The new flagged-only UI can't actually be exercised on
this template until that ordering is settled. That's the open question already sitting in your
store about seeded templates persisting OCR before the gate. Not a reason to hold the PR — a
reason not to call it demo-ready.

There's also a live thread this brushes against without touching: **"CDW returns spouse info"** is
an open business rule in the SDPR stream, and the unresolved part of it is *what happens when the
client leaves the spouse section blank*. The single-character coercion answers that question in
code — blank-ish spouse content becomes `0` — before the business has decided what the answer is.
Worth connecting those two, because right now they're being settled in different rooms.

---

## 6. Where it stands

**One code fix** (scope the coercion to number-typed fields), **one CI fix** (`biome check
--write` in both workspaces — formatting only), then it's good to approve. Everything else I
looked at is clean: additive migration in the right order, audit done correctly with tenant
scoping intact, JSON column validated on read rather than trusted, symmetric evaluator changes,
115 tests passing across the four new suites.

The shape of this work is right, and the accounting behind it is better than most. The defect is
a scope widening in one rule, not a design problem.
