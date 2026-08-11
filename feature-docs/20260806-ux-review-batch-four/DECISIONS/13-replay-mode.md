# Decision 13 — where "Replay mode" should live

**The question:** clicking a run-history row puts the editor into a read-only
replay of an older version, announced by a chip parked next to Undo. Alex:
*"there's like a weird tag there … it makes sense for it to be an indicator
somewhere, but perhaps not there and not like that."* The checklist's Expected
line offers two shapes — "a banner or top-bar state region" — and those are
materially different builds, in the same file batch 11 is rewriting.

**The recommendation:** **a banner across the top of the canvas**, not a top-bar
region. Replay is a mode that disables a large part of the UI, and the top bar
is where the disabled controls *are* — putting the explanation among them is how
we got here.

---

## What the chip is today

`TopBarReplayIndicator`
([WorkflowEditorV2Page.tsx:2187](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L2187))
is a filled Mantine `Badge` with a rewind icon and an `X` action, sitting in the
top bar's action row. Its label is already doing more work than a badge should:

> `Replay mode — v7 (read-only)` · `Replay mode — version unknown (read-only)` ·
> `Replay mode — v7 unavailable, showing current graph`

Three states, one of them a full sentence with a caveat, rendered in a control
sized for a word. The orange variant — the version could not be loaded, so
**you are looking at the current graph while the run is from an older one** — is
the single most important thing the editor can tell you at that moment, and it
is a badge.

Meanwhile replay's actual effect is scattered across controls that just go quiet:
Undo and Redo are disabled ([:1722](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L1722),
[:1735](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L1735)),
and config edits are dropped on the floor — `if (isReplay) return;`
at [:672](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L672),
[:711](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L711)
and [:716](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L716).
So an author in replay can drag a node, type in a field, press Ctrl+Z — and
**nothing happens, with no explanation**, while the only thing that would explain
it is a chip they read as a stray tag.

## Options

**A — banner across the top of the canvas.** A full-width strip below the top
bar: what you're looking at (version, run), that it is read-only, and a "Leave
replay" action. Present only in replay.
*For:* it is proportionate to a mode that silently swallows edits; there is room
for the orange "showing current graph" caveat as a sentence rather than a
squeezed label; it sits over the canvas, which is the thing that is read-only.
*Against:* costs vertical canvas space while active, and needs a transition so
it doesn't jolt the layout on entry.

**B — a state region in the top bar.** Keep it in the bar but give it its own
zone — left of the actions, visually distinct from the buttons.
*For:* no canvas space, smallest change.
*Against:* it competes for the exact real estate batch 11 is reclaiming for item
14 (title + chevron leftmost). Alex's own words on that item were *"we will also
save this real estate, so it will look less messy"* — adding a state region to
the left zone spends the space we just saved. And it keeps the explanation among
the controls it is explaining the deadness of, which reads as decoration.

**C — banner plus a dimmed canvas treatment.** A, and additionally tint or
outline the canvas so read-only is felt, not just read.
*Against:* replay exists to be *examined*; dimming the thing you came to look at
is the wrong trade. Worth noting only to say it was considered and rejected.

## Recommendation — Option A

Ship the banner, retire the badge, and keep the three states as sentences rather
than compressing them. One dependency worth stating plainly: **this lands in the
same file and the same region as batch 11 (item 14)**, so it should be built
after that batch merges, not alongside it — two agents in `WorkflowEditorV2Page`
top-bar code at once is how conflicts get made.

**What I need from you:** A or B. If A, one follow-up — should the banner also
say *why* an edit did nothing when someone tries to edit in replay (a transient
"Replay is read-only" note on the first blocked edit), or is a persistent banner
enough? The first is more helpful and is more work.
