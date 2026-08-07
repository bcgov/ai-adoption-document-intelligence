# Workflow designer — batch four, illustrated

**2026-08-07 · branch `feature/visual-workflow-builder`**

What the fixes from [CHECKLIST.md](CHECKLIST.md) actually look like. One section
per batch, after the change only — no before/after pairs.

Every image was captured from the app running locally against the seeded
database by [`capture-screenshots.mjs`](capture-screenshots.mjs). Nothing here
is a mock-up. Re-run the script after a batch and diff the images:

```bash
npm run dev          # frontend :3000, backend :3002, temporal worker
npm run seed:demos   # the demo workflows the shots open
node feature-docs/20260806-inderdeep-ux-review-batch-four/capture-screenshots.mjs
```

---

## Batch 1 — the icons that don't say what they mean

Items **6, 25, 27, 28, 29**. Five glyph and colour fixes, one shared root
cause: a meaningful glyph drawn inside a container that wins the pixel budget.

### §1 · Run-status badges — item 6

The badge used to draw two concentric circles: the filled `ThemeIcon` disc, and
inside it `IconCircleCheck` / `IconCircleX`, which carry rings of their own. At
16px the rings won. Inderdeep: *"to notice the cross within the circle is very
hard … the more I zoom out, all I see is the circle, which is not the intent."*

Now the disc is the only circle. The glyph is a bare `IconCheck` / `IconX`,
raised from 12px to 15px inside a disc raised from 16px to 20px, and stroked at
2.6 instead of Tabler's default 2.

![Failed node — bare cross in a red disc](screenshots/01-node-status-badge-failed.png)

![Succeeded node — bare check in a green disc](screenshots/02-node-status-badge-succeeded.png)

Both shots are of a real run of the **workflow-as-API** demo — the same demo
Inderdeep had open when he reported this. The badges only exist while a run is
active (`NodeStatusBadgeOverlay` renders nothing without an `activeRunId`, so
that a design-time canvas isn't littered with gray dots), so there is no way to
photograph them except by really running something.

**Two open items are visible in these frames, and both are worth seeing:**

- The neighbouring card overlapping the failed node is **item 9** — pressing
  Try grows the cards to fit their preview panels, and they collide. Unfixed.
- The second shot is **item 10** in one frame: a **green success check** on a
  node whose panel reads *"Preview unavailable — cache evicted."* Both verdicts
  on the same card, which is exactly what Inderdeep called confusing.

### §2 · Agent chat header — items 27, 28, 29

Three icons, three complaints, left to right in the shot:

| Icon | Was | Now |
|---|---|---|
| Stop | `IconPlayerStop`, an outlined square — *"I don't know what it represents"* | `IconPlayerStopFilled` |
| New conversation | `IconRefresh` — *"this says new conversation, while the icon says a refresh"* | `IconPlus` |
| Close | `IconCircleX` — *"the cross is way too small … should only be a cross rather than a cross within the circle"* | `IconX` |

![Chat header — filled stop, plus, bare cross](screenshots/03-agent-chat-header.png)

The stop button still lives in the header, detached from the conversation it
stops. That placement is **item 26** and is not in this batch — only the glyph
changed here, and it travels with the button when the button moves.

### §3 · The composer — item 25

![Composer — white glyph on the theme blue, blue focus ring](screenshots/04-agent-chat-composer.png)

**Inderdeep was right and the cause was bigger than the chat.** He reported the
send icon as *"black on purple, not very accessible"*. Measured in the browser
on 2026-08-07, the enabled send button really did render a near-black glyph on
its coloured fill — `color: rgb(45,45,45)` on `background: rgb(85,149,217)`.

The cause was not in the agent chat at all. A project-wide rule in
[`ui/bcds-mantine-fallbacks.css`](../../apps/frontend/src/ui/bcds-mantine-fallbacks.css)
set the BC DS icon colour on **every** ActionIcon:

```css
.mantine-ActionIcon-root {
  color: var(--icons-color-primary);   /* near-black, unconditionally */
}
```

That beat Mantine's own `color: var(--ai-color)` on order, so it stamped
near-black over every *filled* icon button in the app — anywhere one exists,
not just here. It is now qualified to leave filled variants alone:

```css
.mantine-ActionIcon-root:not([data-variant="filled"]) {
  color: var(--icons-color-primary);
}
```

The button itself also moved off violet onto the theme's primary blue —
`appTheme.primaryColor` is `blue`, and the composer was the one place painting
its main action off-palette. The composer's focus ring followed it, off a
hardcoded `#845ef7`.

**One number worth knowing before this is called an accessibility win.** White
on the theme's filled blue `#5595D9` measures **3.14:1**. That clears the 3:1
floor WCAG 1.4.11 sets for non-text UI components, but not by much — and it is
*lower* than the near-black glyph scored on the same blue (4.37:1). The reason
the change is still right is the colour it replaced: on the violet that was
actually there, near-black scored **2.47:1** and failed, while white scores
5.55:1. So Inderdeep's call was correct for the button in front of him.

The residue is a design-system question, not a chat question: **the app's
default filled blue is a marginal background for white glyphs everywhere it is
used.** Darkening the filled shade to `blue.7` (`#3470B1`) would take white to
5.12:1. That is Inderdeep's call to make across the system rather than mine to
make on one button, so the button stays consistent with every other filled
action in the app and the question is recorded here.

![The chat panel with all three changes in place](screenshots/05-agent-chat-panel.png)

**Verification:** frontend suite **2496 passed** across 205 files, `tsc
--noEmit` clean, Biome clean. The badge change carries a new regression test
asserting that `succeeded` and `failed` never render a circle-wrapped icon
again.
