# Transform Node — Manual Testing Instructions

This document explains how to run `example-workflow.json` as a live Temporal workflow and describes one known limitation of the example graph's edge structure.

## Prerequisites

- Local dev stack running (`Dev: all` task, or equivalent)
- A workflow config record created in the database with the contents of `example-workflow.json` as the `graph` field
- The Temporal worker connected to the `ocr-processing` task queue

## Running the Workflow

Submit the workflow config through the normal document-processing pipeline. Because all input data is seeded via `defaultValue` in the `ctx` declarations, no real document or OCR result is required — the transform nodes will execute using the hard-coded seed values.

Expected execution order and outputs:

| Node | Conversion | Output ctx key |
|------|-----------|----------------|
| `parseCustomer` | CSV → JSON | `customerJson` |
| `parseOrder` | XML → JSON (includes `#each` array iteration) | `orderJson` |
| `buildPayload` | JSON → JSON (3 input ports) | `payloadJson` |
| `renderSoap` | JSON → XML + SOAP `xmlEnvelope` (includes `#each`) | `soapOutput` |

The final `soapOutput` value should be a valid SOAP envelope containing a `<SubmitOrderRequest>` body with both `<Item>` line items expanded.

## Known Limitation: Scheduling Edges vs. Data Edges

The graph engine resolves execution order by following edges forward from a single `entryNodeId`. A node with **no incoming edges** (other than the entry node itself) is unreachable and will never execute.

In `example-workflow.json`, `parseCustomer` and `parseOrder` are logically independent — each reads its own ctx key (`customerCsv` and `orderXml` respectively) and neither needs the other's output. However, because there is only one `entryNodeId` (`parseCustomer`), `parseOrder` must be made reachable via an edge:

```
parseCustomer → parseOrder   (scheduling only — no data flows across this edge)
```

This edge carries no semantic meaning; it exists solely to ensure `parseOrder` is scheduled. The engine will still wait for all predecessors of `buildPayload` (`parseCustomer` and `parseOrder`) to complete before running it, so execution correctness is maintained.

**Implication for workflow authors:** any node that has no data dependency on the entry node still needs at least one incoming edge from a reachable node to be included in the execution. A comment or label on the edge can be used to make this intent clear in the UI.
