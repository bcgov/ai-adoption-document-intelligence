# Decision record — per-port handles supersede Model A

**Status:** Reversal recorded 2026-07-15; stakeholder sign-off outstanding.
**Supersedes:** [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) §4–§5 (2026-04-27).
**Superseded by / rationale:** [PORT_WIRING_DESIGN.md](PORT_WIRING_DESIGN.md) §1, §16.

This note exists so the reversal of a documented decision is on the record —
and so the pending stakeholder confirmation ([PORT_WIRING_DESIGN.md](PORT_WIRING_DESIGN.md)
§16, "Designer sign-off") doesn't get silently forgotten.

## What was decided (2026-04-27)

`WORKFLOW_NODE_IO_MODEL_DECISION.md` evaluated two node I/O models for the canvas:

- **Model A** (n8n / Make) — one input handle + one output handle per node; wires
  mean **execution order only**; data wiring is invisible (auto-wire) or in a
  settings-panel picker.
- **Model B** (ComfyUI) — one handle **per typed port**; wires are the data.

Its §4 recommended **Model A** and §5 explicitly **rejected user-drawn per-port
typed handles**. That rejection is what this record supersedes.

## What is now decided

The port-wiring redesign adopts what is essentially **Model B**: per-port handles,
port-to-port data wires, "the wire is the data." The three load-bearing arguments
behind the Model A recommendation have since dissolved
([PORT_WIRING_DESIGN.md](PORT_WIRING_DESIGN.md) §1):

1. **"No typed-port registry exists"** → it exists now: catalog `PortDescriptor`s
   carry `kind`, backed by the artifact-kind registry and `isAssignable`.
2. **"Typed wires would be UI fiction the engine doesn't honor"** → the save-time
   binding-walk validator enforces kind-compatibility on every producer/consumer
   ctx-key pair, so a rendered wire is a faithful picture of a real `PortBinding`.
3. **"The canvas is read-only"** → it is now a full authoring surface.

Plus a demand-side shift: the primary persona for *manual* building is now a
**business/ops user**, for whom "wires = execution order, data invisible" inverts
the mental model every comparable tool (n8n, Make, Node-RED) trains.

## Scope of the change

Presentation / wiring layer only — no change to `GraphWorkflowConfig`, the engine,
or the resolver's binding semantics. Shipped across all five phases (catalog +
vocabulary; per-port handles + derived wires; gestures; wire data peek; conditions
from node outputs). On `feature/visual-workflow-builder` (draft PR #230 →
`develop`).

## Outstanding

Confirmation from the owner of the original Model A recommendation
(`WORKFLOW_NODE_IO_MODEL_DECISION.md` references a "single-purpose split proposal" for the
single-purpose split) that per-port handles superseding Model A is agreed — or a
conversation before this lands on `develop`. This is a traceability / courtesy
step, not a merge blocker; recorded here so it stays visible.

**Confirmed by / date:** _(pending)_
