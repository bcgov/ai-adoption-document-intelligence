/**
 * Unit tests for the on-selection type pill (US-096).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/user_stories/US-096-on-selection-type-pill.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodeTypePill, type NodeTypePillEntry } from "./NodeTypePill";

function renderPill(
  entries: NodeTypePillEntry[],
  direction: "input" | "output",
  hidden?: boolean,
) {
  return render(
    <MantineProvider>
      <NodeTypePill entries={entries} direction={direction} hidden={hidden} />
    </MantineProvider>,
  );
}

describe("NodeTypePill — Scenario 1: single typed port renders one uppercase badge", () => {
  it("renders a single Badge with uppercase `SEGMENT[]` for a Segment[] output", () => {
    renderPill([{ portName: "segments", kind: "Segment[]" }], "output", false);
    const pill = screen.getByTestId("node-type-pill-output");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent("SEGMENT[]");
    expect(pill.getAttribute("data-pill-direction")).toBe("output");
    expect(pill.getAttribute("data-pill-color")).toBe("green");
    expect(pill.getAttribute("data-pill-kind")).toBe("Segment[]");
  });

  it("renders a single Badge with uppercase `DOCUMENT` for a Document input — colour blue", () => {
    renderPill([{ portName: "source", kind: "Document" }], "input", false);
    const pill = screen.getByTestId("node-type-pill-input");
    expect(pill).toHaveTextContent("DOCUMENT");
    expect(pill.getAttribute("data-pill-direction")).toBe("input");
    expect(pill.getAttribute("data-pill-color")).toBe("blue");
  });
});

describe("NodeTypePill — Scenario 2: multi-port renders an expanded list with per-row colour", () => {
  it("renders one Badge per port with `<portName>: <kind>` labels and per-row colour", () => {
    renderPill(
      [
        { portName: "segmentType", kind: "Classification" },
        { portName: "confidence", kind: "Artifact" },
        { portName: "matchedRule", kind: "Artifact" },
      ],
      "output",
      false,
    );

    const container = screen.getByTestId("node-type-pill-output");
    expect(container.getAttribute("data-pill-direction")).toBe("output");

    // Each declared port mounts its own badge with the `<portName>: <kind>` label.
    const classificationRow = container.querySelector(
      "[data-pill-port='segmentType']",
    );
    const confidenceRow = container.querySelector(
      "[data-pill-port='confidence']",
    );
    const matchedRuleRow = container.querySelector(
      "[data-pill-port='matchedRule']",
    );

    expect(classificationRow).not.toBeNull();
    expect(confidenceRow).not.toBeNull();
    expect(matchedRuleRow).not.toBeNull();

    expect(classificationRow).toHaveTextContent("segmentType: Classification");
    expect(confidenceRow).toHaveTextContent("confidence: Artifact");
    expect(matchedRuleRow).toHaveTextContent("matchedRule: Artifact");

    // Per-row colour: Classification → yellow (Mantine's amber); Artifact
    // wildcards → gray. The colour differs between the two families which
    // satisfies the "different colour attribute" assertion in the story.
    expect(classificationRow?.getAttribute("data-pill-color")).toBe("yellow");
    expect(confidenceRow?.getAttribute("data-pill-color")).toBe("gray");
    expect(matchedRuleRow?.getAttribute("data-pill-color")).toBe("gray");
  });

  it("renders the multi-port input pill with two typed rows and distinct family colours", () => {
    renderPill(
      [
        { portName: "ocrResult", kind: "OcrResult" },
        { portName: "segment", kind: "Segment" },
      ],
      "input",
      false,
    );

    const container = screen.getByTestId("node-type-pill-input");
    const ocrRow = container.querySelector("[data-pill-port='ocrResult']");
    const segmentRow = container.querySelector("[data-pill-port='segment']");

    expect(ocrRow).toHaveTextContent("ocrResult: OcrResult");
    expect(segmentRow).toHaveTextContent("segment: Segment");
    expect(ocrRow?.getAttribute("data-pill-color")).toBe("violet");
    expect(segmentRow?.getAttribute("data-pill-color")).toBe("green");
  });
});

describe("NodeTypePill — Scenario 3: pill hides on deselection", () => {
  it("renders nothing when `hidden` is true", () => {
    renderPill([{ portName: "segments", kind: "Segment[]" }], "output", true);
    // No pill element should be in the DOM at all. We also assert the
    // input variant isn't accidentally rendered.
    expect(
      screen.queryByTestId("node-type-pill-output"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("node-type-pill-input"),
    ).not.toBeInTheDocument();
  });

  it("renders the pill back when `hidden` flips to false", () => {
    const { rerender } = render(
      <MantineProvider>
        <NodeTypePill
          entries={[{ portName: "segments", kind: "Segment[]" }]}
          direction="output"
          hidden={true}
        />
      </MantineProvider>,
    );
    expect(
      screen.queryByTestId("node-type-pill-output"),
    ).not.toBeInTheDocument();

    rerender(
      <MantineProvider>
        <NodeTypePill
          entries={[{ portName: "segments", kind: "Segment[]" }]}
          direction="output"
          hidden={false}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId("node-type-pill-output")).toBeInTheDocument();
  });
});

describe("NodeTypePill — Scenario 4: pill renders nothing when no ports declare a kind", () => {
  it("renders nothing when `entries` is empty", () => {
    renderPill([], "output", false);
    expect(
      screen.queryByTestId("node-type-pill-output"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("node-type-pill-input"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when every entry's kind is undefined (legacy un-typed descriptors)", () => {
    renderPill(
      [
        { portName: "x", kind: undefined },
        { portName: "y", kind: undefined },
      ],
      "output",
      false,
    );
    expect(
      screen.queryByTestId("node-type-pill-output"),
    ).not.toBeInTheDocument();
  });

  it("renders only the typed entries (plus a wildcard row for the untyped one) when entries are mixed", () => {
    renderPill(
      [
        { portName: "x", kind: "Document" },
        { portName: "y", kind: undefined },
      ],
      "output",
      false,
    );
    const container = screen.getByTestId("node-type-pill-output");
    const xRow = container.querySelector("[data-pill-port='x']");
    const yRow = container.querySelector("[data-pill-port='y']");
    expect(xRow).toHaveTextContent("x: Document");
    expect(yRow).toHaveTextContent("y: Artifact");
    expect(xRow?.getAttribute("data-pill-color")).toBe("blue");
    expect(yRow?.getAttribute("data-pill-color")).toBe("gray");
  });
});
