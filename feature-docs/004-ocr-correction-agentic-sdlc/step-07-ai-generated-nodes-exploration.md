# Step 7: AI-generated custom correction nodes (exploration)

**Parent:** [OCR Correction and Agentic SDLC Requirements](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) — Section 9  
**Implementation order:** 7 (can be done in parallel or after Step 6)  
**Dependencies:** None required; exploration only unless one approach is chosen for implementation.

---

## Goal

Explore and document approaches for having AI generate custom correction nodes on the fly (e.g. from HITL patterns or natural language). If one approach is implemented, it must include validation and be documented. No placeholder implementations.

## Requirements

- **Exploration:** Investigate and document approaches where an AI (e.g. LLM) generates a correction node or rule (e.g. a small function, a config for an existing node type, or a structured rule set) from HITL patterns or from a natural language description.
- **Safety and validation:** Any generated node SHALL be **validated** (e.g. schema, sandbox, or review) before being used in a workflow; the requirements for that validation SHALL be documented.
- **Scope:** This is an **exploration** requirement: document options, constraints (e.g. determinism for Temporal), and recommend whether to implement "generate config" vs "generate code" vs hybrid. No placeholder implementations.

## Acceptance criteria

- [ ] A **short design/exploration document** in `/docs` describes at least **two approaches** (e.g. AI-generated rule config vs AI-generated code), risks, and validation strategy.
- [ ] If **one approach is implemented:** it includes validation and is documented; otherwise only the exploration doc is required.

## References

- [docs/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md](../../docs/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md) — node/activity contract
- Temporal determinism constraints for any generated code
