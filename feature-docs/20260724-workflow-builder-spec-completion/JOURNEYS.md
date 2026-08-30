# Author Journeys — workflow builder

Goal-first journeys for Pass A. Each one is written from the author's side of the
glass: what they are trying to accomplish and the sequence a competent person would
assume, **not** which controls they operate. None of these describe the product's
current behaviour, and none of them assert that any of it is possible today —
establishing that is Pass A's job.

Vocabulary is the domain's own: documents, pages, segments, classification labels,
confidence, OCR results, review queue, review session.

Prior knowledge is stated honestly per journey and deliberately spans first-timer to
someone on their fourth workflow.

---

### J1 — "Get the fields off a stack of scanned forms without anyone re-typing them"

**Author:** Priya, a program analyst. She has never built a document pipeline. She
knows what OCR is in the loose sense ("the computer reads the scan"), knows her
forms have a consistent layout, and has been told this tool can do it. She has not
been trained on it and nobody is sitting next to her.

**Starting point:** A folder of roughly 60 scanned single-page forms, PDF, all the
same layout. No existing workflow. An empty starting state in the tool.

**Goal:** For each form, the text and the labelled field values are extracted and
stored, so that at the end she can point at a place where all 60 results live and
say "these came out of those files." She wants to prove the idea works before she
asks for anything bigger.

**Steps they expect to take:**

1. Start something new and give it a name that means something to her, e.g. "Intake
   form extraction".
2. Say where the documents come from — she expects to be able to hand the thing
   files herself, since that is all she has.
3. Say what should happen to each one: read it, pull out the fields, keep the result.
   She expects the tool to already know how to read a document — she is choosing from
   what it can do, not describing OCR from first principles.
4. Try it on one form first. She wants to see the actual extracted values from *that
   specific form*, not a green tick, because the only thing that convinces her is
   recognising the applicant's name off the page.
5. Fix whatever the trial exposes — most likely that she chose the wrong reading
   model for her layout, or the result is being read but not kept anywhere.
6. Run the rest of the folder through it.

**What "done" looks like:** She can name the workflow, point to the extracted field
values for a form she picked at random, confirm they match what is printed on the
page, and see that the other forms have results of the same shape. If the tool
cannot read a particular form, she can tell that from the outcome rather than
assuming a blank result means an empty form.

---

### J2 — "Run the quarterly intake batch and find out exactly which files we could not read, and why"

*This is the journey grounded in a real production incident: documents stranded in
"Processing" that could neither finish nor be deleted, many of them
password-protected PDFs.*

**Author:** Marcus, an operations analyst. He has built one workflow before (a
single-document OCR chain like J1) and runs intake batches monthly. He knows the
document statuses by their user-facing names — Waiting, Processing, Complete,
Failed — because he watches them go by.

**Starting point:** A working extraction workflow and a quarterly intake batch of
about 240 PDFs from four different source agencies. He knows from experience that
some fraction of them are password-protected on open (one agency encrypts
everything before emailing it), some are photographs of paper rather than real PDFs,
and a couple are corrupt. He does not know which ones, or how many.

**Goal:** Every one of the 240 documents reaches a settled outcome — either it was
processed, or it definitively was not and he knows the reason. He must be able to
hand back a list to each source agency naming the exact files they need to resend,
with a reason per file. The batch must not sit half-finished with no way to tell
whether it is still working or wedged.

**Steps they expect to take:**

1. Feed the whole batch through the existing workflow in one go, rather than 240
   separate runs he has to babysit.
2. Watch progress at the level of the batch: how many are done, how many are still
   going, how many have failed. He expects the counts to add up to 240 at all times.
3. When the finished count stops moving, tell the difference between "still working
   on a slow document" and "stuck and never going to finish". This is the specific
   thing that burned him before.
4. For the failures, get the reason attached to the individual document — "this file
   is password-protected and was never read" is a different problem for him than
   "the reading service rejected the content" or "the file is not a readable PDF",
   and he has to route them to different people.
5. Export or otherwise carry away a per-file list of failures with reasons, grouped
   well enough that he can split it by source agency.
6. Get rid of the failed documents once the agencies have been told — he does not
   want last quarter's dead files polluting this quarter's counts, and he expects a
   failed document to be removable.

*Edge branch, same journey:* having learned that one agency's encrypted files fail
every single quarter, he wants the next batch to handle it without his supervision —
unreadable files set aside with their reason recorded and the remaining 228 finishing
normally, rather than one bad file taking the run down or leaving him to reconcile by
hand. He expects to describe this once in the workflow, and to be able to check that
he described it correctly without deliberately breaking a file to test it.

**What "done" looks like:** He can state, for all 240 documents, which finished and
which did not; every non-finished document carries a human-readable reason; no
document is still showing as in-progress; the failed ones can be removed; and he has
a per-agency resend list he could paste into an email without editing.

---

### J3 — "Split a monthly report into its sections and treat each section differently"

**Author:** Marcus again, a few weeks later — second real workflow. He now knows the
tool reads documents and that results land somewhere. He has never dealt with
multi-part documents in it.

**Starting point:** Monthly client report packages, 6–20 pages each. Each package is
one PDF containing a monthly report, then one or more supporting documents — pay
stubs, bank records — and each section starts with a printed header line like
"Page 3 — Supporting Document #1: Pay Stub". The section order and count vary per
client. He has a working single-document extraction workflow and a stack of sample
packages.

**Goal:** Each package comes out as its identified sections, each section read with
the settings appropriate to its kind, and the results reassembled into one result
for the package — plus a cross-check that the numbers agree across sections (the
gross pay on the report should match the gross pay on the pay stub).

**Steps they expect to take:**

1. Read the whole package once, so that the printed section headers are available as
   text with the page they appear on.
2. Describe the section boundaries the way he actually recognises them — by the
   header wording — and give each pattern a label: monthly report, pay stub, bank
   record. He expects to be able to see, on a real sample, which pages each pattern
   matched before he commits to it.
3. Say what should happen to *each* section, with the branching depending on the
   section's label rather than its position, since the order varies. He expects to
   reuse the extraction he already built for whole documents rather than rebuilding
   it three times.
4. Handle the section that matches nothing — he assumes there will always be one, and
   he does not want an unrecognised page silently dropped.
5. Bring the per-section results back together into a single result for the package.
6. Add the cross-section checks: net pay equals gross minus deductions within a few
   cents; the report's gross pay matches the pay stub's; the deposits on the bank
   record account for the report's income. He expects to express these as arithmetic
   and matching rules over named field values, with a tolerance, not as code.
7. Try a real package end to end and confirm the sections were cut where he thinks
   they were, before trusting the checks.

**What "done" looks like:** For a sample package he can name each section, its label,
and its page range; each section's fields are extracted; the package's combined
result contains all sections; and the cross-checks report pass or fail per rule with
the values they compared. A package with an unlabelled section still completes, with
that section visibly marked as unrecognised.

---

### J4 — "Read every page of a long document separately and get one combined result"

**Author:** Marcus, third workflow. He now knows the tool splits and branches. He has
not done anything page-by-page.

**Starting point:** Long, unstructured documents — 40 to 300 pages, no section
headers, no fixed layout: case files, ledgers, correspondence bundles. A working
whole-document workflow that times out or produces mush on the long ones.

**Goal:** Each page is read on its own, and the results are gathered back into one
per-document result in page order, so that a search for a phrase can say which page
it was on. He also cares that a 300-page document does not take 300 times as long as
a one-page document — he expects pages to be processed several at a time.

**Steps they expect to take:**

1. Get the document's pages as separate items to work on, without knowing the page
   count in advance — the same workflow has to cope with 40 and with 300.
2. Say "do this for each page", and describe the per-page work once.
3. Say how many pages may be in flight at a time, because he has been told the
   reading service has limits and he does not want to find out by being throttled.
4. Gather the per-page results back into one collection, in page order, tagged so he
   can tell which result came from which page.
5. Do something with the whole collection at the end — store it as the document's
   result.
6. Try it on a genuinely long sample and see the per-page work actually fanning out
   rather than crawling one page at a time. He expects to be able to tell whether it
   is progressing and roughly how far along it is.
7. Decide what a single bad page means: he wants the other 299 pages, with the bad
   page identified — not a lost document.

**What "done" looks like:** A 300-page sample produces 300 per-page results collected
under one document, each attributable to its page number; the elapsed time is
visibly better than sequential; and a deliberately unreadable page shows up as one
identified failed page inside an otherwise complete result.

---

### J5 — "Sort incoming mail by type and send the doubtful ones to a person"

**Author:** Dana, who has built three workflows and reviews documents herself two
days a week. She knows extraction produces confidence values, and she runs the
review queue, so she knows what it feels like to receive work from it.

**Starting point:** A single mixed inbound stream — invoices, receipts, correspondence
and forms all arriving together. Existing extraction workflows for the invoice and
receipt shapes. Nothing that decides which is which.

**Goal:** Each arriving document is identified as one of the known types, extracted
with the settings for that type, and then — depending on how sure the system is —
either finished automatically or handed to a human reviewer, with the reviewer seeing
only the documents that genuinely need a person. She wants roughly the bottom 10% by
confidence going to people, and she wants to be able to move that line later without
rebuilding the workflow.

**Steps they expect to take:**

1. Have each document classified into one of the known types, and see the type and
   how sure the system is about it.
2. Route to the extraction appropriate to that type. Decide what happens to a
   document whose type is unrecognised or whose type is a coin-flip — she assumes
   these exist and expects to send them to a person rather than guess.
3. After extraction, compare the confidence of the result against a threshold. She
   expects the threshold to be a value she can change without touching the structure
   of the workflow, and she expects to be able to change it for one group without
   affecting another.
4. Send below-threshold documents to human review, and have them actually appear in
   the review queue her team works from — with enough of the document itself
   alongside the extracted values that a reviewer can check them against the page,
   the least certain values first.
5. Have the workflow wait for the reviewer's decision rather than finishing without
   it, and continue based on what the reviewer did: approved, escalated to an expert,
   or skipped. She expects escalation to reach a different person, not to loop back
   to the same queue.
6. Decide what happens if nobody reviews it — a document must not wait forever, and
   she expects to say what happens when it has waited too long.
7. Confirm the corrections a reviewer makes are what gets stored, not the original
   uncertain extraction.

**What "done" looks like:** A test batch of mixed mail ends with each document either
completed automatically or completed after review; the review queue contains only the
low-confidence ones; a reviewer's corrected value is what appears in the final stored
result; an escalated document is visibly waiting on an expert rather than marked done;
and she can raise the threshold and see more documents route to review on the next
batch without editing the workflow's structure.

---

### J6 — "Understand the workflow I inherited before I touch it"

**Author:** Sam, a developer new to the team. Competent, comfortable with pipelines
in general, but has never seen this tool and did not build this workflow. The person
who did has left.

**Starting point:** An existing 16-step workflow that runs in production against
real client packages. A ticket saying "bank records are being read with the wrong
model — point them at the new one." No documentation beyond the workflow itself and
whatever run history exists.

**Goal:** Sam can explain, out loud and correctly, what the workflow does and in what
order, find the one place that determines the bank-record reading model, change it,
and be confident the change did not affect the other branches — before it runs
against real client data.

**Steps they expect to take:**

1. Get an overview at a glance: roughly what this does, in what order, without having
   to read every step. Sam expects the structure to be legible at a scale larger than
   individual steps — logical stages, not 16 undifferentiated steps in a row.
2. Follow one document's path through it, including where it branches and what
   decides each branch. Sam needs to read the branch conditions as statements about
   the data, not as expressions to be reverse-engineered.
3. Find where a given value comes from and where it goes: for any step, what feeds it
   and what consumes what it produces. This is the crux — Sam cannot safely change
   anything without knowing what reads it downstream.
4. See what the workflow expects to be given when it starts, and what it produces at
   the end.
5. Look at a previous real run to confirm the reading of it — which branches actually
   fired for a particular package, and what each stage produced. Sam trusts an
   observed run over an inferred one.
6. Locate the bank-record model setting, change it, and check what else that setting
   is shared with before saving. Sam specifically fears that the three branches share
   one setting and the ticket only wants one of them changed.
7. Verify the change is what was intended by comparing against how it was before, and
   know how to get back if it was wrong.
8. Try the changed workflow against a sample package without exposing production
   traffic to it.

**What "done" looks like:** Sam can describe the workflow's stages and branch
conditions to a colleague without opening it again; can state which steps read the
bank-record model setting; has made the change with only bank-record segments
affected; has run a sample package through the changed version and seen the bank
record read with the new model and the other sections unchanged; and can say exactly
how to undo it.

---

### J7 — "Find out which step produced the wrong total in yesterday's run"

**Author:** Dana, on support duty. She built or knows the workflow. She is competent
and under time pressure — a client is disputing a figure.

**Starting point:** A specific completed run over a specific client package that
finished without error but produced a net-pay total that is wrong by about $400. The
package is available. The run happened yesterday. Nothing failed, so there is no
error to follow.

**Goal:** Identify the step where the value first became wrong, distinguish among the
plausible causes — the page was misread, the page was assigned to the wrong section,
a correction step altered a good value, a validation rule silently accepted a bad
one, or a reviewer changed it — and be able to say which, with evidence, to the
client.

**Steps they expect to take:**

1. Find the run for that particular document, by the document rather than by
   remembering when it ran.
2. See the workflow as it was *at the time of that run*, not as it is now. She knows
   the workflow has been edited since, and a diagnosis against the current version
   would be worthless.
3. Walk the run in order and see what each step actually produced for this document —
   the real values, not just that the step succeeded.
4. Find the earliest point where the total is already wrong, by comparing consecutive
   steps' values. This is the whole job: she is bisecting a pipeline by its
   intermediate values.
5. At that step, see what it was given as well as what it produced, so she can tell
   "it was handed bad input" from "it corrupted good input".
6. Check the branch decisions for this document — which section this page was
   assigned to, and whether the confidence check sent it to review. If a person
   touched it, she needs the reviewer, the time, and the before-and-after values.
7. Compare against a run of the same package that came out right, if one exists.
8. Re-run just the suspect part against the same document to confirm the diagnosis,
   without re-running the client's whole package or creating a second official result
   for it.

**What "done" looks like:** She can name the step where the value first went wrong,
show the value going into it and coming out of it, state whether a human or an
automated step changed it, and reproduce it once on demand. If the cause was a human
correction, she can name the reviewer and the session; if it was an automated
correction step, she can point at the rule that fired.

---

## Coverage note

| Shape required | Journey |
|---|---|
| First contact / simplest end-to-end | J1 |
| Mixed batch with encrypted PDFs, failure visibility | J2 (incl. failure-containment branch) |
| Keyword-based splitting, per-section processing | J3 |
| Per-page fan-out and collected result | J4 |
| Classification, confidence routing, human review | J5 |
| Iterating on someone else's workflow | J6 |
| Debugging a wrong result | J7 |
