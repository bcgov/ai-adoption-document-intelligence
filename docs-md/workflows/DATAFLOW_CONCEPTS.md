# Workflow Builder — How Dataflow Works

A plain-language primer on how data moves between nodes in the workflow builder.
Read this once and the settings panel, the wires on the canvas, and the
"+ Create variable" button all stop being mysterious. For the engineering
design behind it, see [AUTO_WIRE_DESIGN.md](AUTO_WIRE_DESIGN.md) and
[TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md).

## The one core idea: shared named values (ctx keys)

There is no separate "the wire carries the value" concept. The single dataflow
primitive is a **named value** — a **ctx key** — in the workflow's shared
context (`ctx`).

- A node **output** _writes_ its result to a ctx key.
- A node **input** _reads_ from a ctx key.
- When an output and an input reference the **same** ctx key, data flows from
  one to the other — and the canvas **draws a wire** to show it.

So a wire is not the thing that moves data; it is a _picture_ of two ports
sharing a key. At runtime, `ctx` is a literal key → value bag: producers put
their outputs in it, consumers read from it.

```
 Prepare File Data                         Submit to Azure OCR
 ┌───────────────────┐                     ┌───────────────────┐
 │ output preparedData├──writes─┐   ┌─reads┤ input fileData     │
 └───────────────────┘         ▼   ▼       └───────────────────┘
                        ctx["preparedFileData"]
                        (the shared named value)
```

Renaming an output's ctx key to match some input's key connects them; renaming
it away disconnects them. Drawing a wire is just the ergonomic way to make two
ports share a key without typing.

## Two kinds of ctx key

Every ctx key is one of two kinds, and they behave differently.

| | Auto key | Hand-authored key |
|---|---|---|
| Looks like | `__auto.<nodeId>.<port>` (e.g. `__auto.prep.preparedData`) | a plain name you choose (e.g. `preparedFileData`, `documentUrl`) |
| Created by | drawing a wire, or the auto-resolver | you, in **Advanced** bindings or **Workflow Settings** |
| Must be declared in Context declarations? | **No** — it's resolver-internal | **Yes** — undeclared = a save-blocking error |
| Shown to you | decoded to the producer's name (`← Prepare File Data`); the raw key only appears in the **Advanced** view | shown as its literal name (`from preparedFileData`) |

### Auto keys — the default, invisible path

Most of the time you never think about ctx keys. The **auto-resolver** runs on
every edit: it walks each node's typed input ports, finds the nearest
compatible upstream producer, and binds them — minting an `__auto.…` key on
both sides. Drawing a wire yourself does the same thing, and additionally
_pins_ that choice so the resolver won't move it.

Because auto keys are machine-generated and machine-consumed, the validator
skips them — you never have to declare them. In the normal UI they're decoded
to a friendly producer name, so you shouldn't see the raw `__auto.` string
anywhere except the **Advanced** raw-bindings view (which is the deliberate
"show me the machinery" escape hatch).

### Hand-authored keys — when you name a value yourself

You type a plain ctx key when there is **no upstream node to wire from**, or you
want an explicit, stable name:

- **Caller-supplied inputs** — a value that arrives from the run trigger / API
  call, not from another node. Declare it, tick **Input** in Workflow Settings,
  and it appears in the Run panel and `/run-spec`.
- **A readable, stable name** — e.g. for library-workflow ports, templates, or a
  value read by many consumers, `preparedFileData` beats `__auto.prep.preparedData`.
- **Manual override** — when you'd rather bind a port by name than accept the
  resolver's guess.

Because a hand-authored key is a name _you_ invented, the system requires you to
**declare** it (see below) before a binding can save.

> **Note on the demo workflows.** When you open a pre-built demo and see explicit
> named keys like `preparedFileData` in the Advanced bindings, that is mostly an
> **authoring choice**, not a requirement. Had the demo author left those ports
> empty, the auto-resolver would have wired them with `__auto.*` keys and the
> graph would behave identically. The demos spell keys out so they read
> deterministically and the Context-declarations table has something to show; the
> auto-wire demos (Part 8) deliberately do the opposite. Don't read the explicit
> keys as "the right way" — for node-to-node flow, drawing a wire is the norm.

## Context declarations (`config.ctx`)

**Context declarations** are the workflow's variable-declaration list — every
hand-authored ctx key, with its type (and optional kind / description / `isInput`
flag). Think `let preparedFileData: object` at the top of a program. They don't
hold values (those live in the runtime `ctx` bag) — they declare which named
variables are _allowed_ to exist.

Edit them in **Workflow Settings → Context declarations**. Renaming a key there
rewrites every binding that referenced it, so a rename never silently breaks a
wire.

## Why the "+ Create variable" button exists

In a node's **Advanced** bindings, if you type a new name (e.g. `myNewVar`) into
an input, a **+ Create variable "myNewVar"** button appears. Here's the full
chain:

1. Binding a port to an **undeclared** hand-authored key is a save-blocking
   validation error: _"Port binding references undeclared ctx key."_
2. `myNewVar` isn't in Context declarations yet, so the binding is invalid.
3. The button declares `myNewVar` inline (adds it to `config.ctx`) so you skip
   the detour to Workflow Settings. The binding becomes valid and the error
   clears.

This only applies to hand-authored keys — drawing a wire never trips it, because
the auto key it creates is exempt from the declaration check.

## Why "no producer" is not an error

A ctx key can be _consumed_ by an input while _nothing produces it_ — and that is
intentionally valid (no error, no warning). The validator only requires that a
bound key be **declared**, and that producer/consumer **kinds** match _when_ a
producer exists. It does **not** require every consumed value to have a producing
node, because `ctx` can also be filled by the run's trigger / input. So a
declared-but-unproduced variable (a caller input, or a placeholder you'll wire
later) passes validation by design.

## Runtime inputs — making a workflow callable

A ctx key can be filled at run time by the **caller** (the API request, upload,
or trigger that starts the workflow) instead of by an upstream node. This is how
you make a value configurable per run.

### Declaring is not enough — flag it as an Input

Declaring a ctx key gives you a named slot; it does **not** make it a caller
input on its own. To make it caller-supplied you also tick the **Input** checkbox
on the declaration (`isInput`). Only flagged declarations enter the workflow's
derived input schema — see
[`deriveInputSchema`](../../apps/backend-services/src/workflow/derive-input-schema.ts).
So there are three tiers:

- **Declared, not Input** — an internal variable. Not part of the API; a caller
  can't pass it. (Placeholder inputs in the demos are this: declared, no producer,
  not flagged — illustrative only.)
- **Declared + Input** — a caller input, surfaced in the **Run** drawer and the
  `/run-spec` endpoint.
- **Input + a default value** — an _optional_ input; without a default it is
  **required**.

### Three ways to define a workflow's input API

The Run drawer / `/run-spec` derives the trigger URL, JSON input schema, and
sample curl from one of these, in precedence order:

1. A **`source.api` node** (the "Workflow-as-API" demo, Part 11) — its declared
   fields _are_ the input schema and win over everything else.
2. A **library workflow's** `metadata.inputs[]` ports.
3. A regular workflow's **Input-flagged ctx declarations**.

Pick one: if a `source.api` node exists, `isInput` flags are ignored (the
validator warns about mixing the two).

### Why a node doesn't care where its input came from

At run time `ctx` is a single shared bag. It **starts** seeded with the caller's
inputs, then each node **writes its outputs into the same bag**, and downstream
nodes **read** from it. Caller inputs and node outputs share one namespace:

```
run starts:   ctx = { documentId: "abc", blobKey: "…" }   ← caller inputs (Input-flagged keys)
prep runs:    ctx["preparedFileData"] = {...}              ← node output written in
submit reads: ctx["preparedFileData"] → ctx["apimRequestId"] = "…"
```

That is why an input binding is just "read ctx key X" — the node never
distinguishes a caller-supplied value from an upstream node's output. Whether a
key is caller-supplied is a property of its **declaration** (`isInput`), set once
at the workflow level, not something declared per node.

## Quick reference

- **Wire = two ports sharing a ctx key.** Drawing one, or renaming keys to match,
  is the same underlying action.
- **Auto keys** (`__auto.*`) are created for you, never need declaring, and are
  shown decoded to the producer's name.
- **Hand-authored keys** are names you choose; they must be **declared** in
  Workflow Settings (the Create-variable button is the one-click shortcut).
- **Context declarations** are the list of allowed named values and their types.
- **No producer ≠ error** — a declared key with no writer is valid (it may come
  from the run's input).
- **Runtime inputs** — to make a value caller-configurable, declare it **and tick
  Input** (`isInput`); with a default it's optional, without one it's required.
  Only Input-flagged keys (or a `source.api` node's fields) form the workflow's
  callable API.
- **Demo keys** — explicit named keys in the pre-built demos are mostly an
  authoring choice; auto-wiring the same graph behaves identically.
