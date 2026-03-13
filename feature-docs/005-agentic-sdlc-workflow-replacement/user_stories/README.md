# User Stories — Agentic SDLC Workflow Replacement and Feedback Loop (Feature 005)

These user stories implement **conditional workflow replacement**, the **full AI feedback loop** as a Temporal workflow, and **AI-generated correction nodes exploration**. They are to be implemented **after** [Feature 004](../004-ocr-correction-agentic-sdlc/) (OCR Correction Tools and Benchmark Comparison), which provides correction tools, AI HITL processing, workflow modification utility, and benchmark integration.

Requirements: [Feature 005 REQUIREMENTS.md](../REQUIREMENTS.md).

After implementing a user story, check it off in the phase sections below.

---

## Phase 1: Conditional workflow replacement (005 Step 1)

| File | Title | Done |
|------|-------|------|
| `US-015-active-workflow-pointer.md` | Active workflow pointer (designate current production workflow) | [ ] |
| `US-016-replacement-automation.md` | Replacement automation (read comparison → update active workflow if no degradation) | [ ] |

---

## Phase 2: AI feedback loop (005 Step 2)

| File | Title | Done |
|------|-------|------|
| `US-017-temporal-agentic-loop-workflow.md` | Temporal workflow for agentic feedback loop | [ ] |
| `US-018-loop-trigger-documentation.md` | Document loop trigger (on-demand, schedule, or event) | [ ] |

---

## Phase 3: AI-generated nodes exploration (005 Step 3)

| File | Title | Done |
|------|-------|------|
| `US-019-ai-generated-nodes-exploration-doc.md` | Exploration document for AI-generated correction nodes | [ ] |

---

## Suggested implementation order

- [ ] **US-015** — Active workflow pointer (no dependency on other 005 stories; depends on Feature 004 being done)
- [ ] **US-016** — Replacement automation (depends on US-015)
- [ ] **US-017** — Temporal agentic loop workflow (depends on Feature 004 and US-015, US-016)
- [ ] **US-018** — Loop trigger documentation (with or after US-017)
- [ ] **US-019** — AI-generated nodes exploration doc (independent; can be done in parallel)
