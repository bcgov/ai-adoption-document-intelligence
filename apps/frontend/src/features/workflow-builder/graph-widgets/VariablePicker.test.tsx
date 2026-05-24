/**
 * Tests for `VariablePicker` typed-I/O behaviour (US-097).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/user_stories/US-097-variable-picker-dim-tooltip.md.
 */

import "@testing-library/jest-dom";

import type { KindRef } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { VariablePicker } from "./VariablePicker";

function renderPicker(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * A graph config with four declared ctx vars: `seg1`, `seg2`, `docA`,
 * `ocrX`. The producer kinds are supplied via the `resolveProducerKind`
 * prop in each test rather than baked into the config so the tests stay
 * close to the scenario language.
 */
function makeFourVarConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "host",
    nodes: {
      host: {
        id: "host",
        type: "activity",
        label: "Host",
        activityType: "test.noop",
      },
    },
    edges: [],
    ctx: {
      seg1: { type: "object" },
      seg2: { type: "object" },
      docA: { type: "object" },
      ocrX: { type: "object" },
    },
  };
}

const FOUR_VAR_RESOLVER = (ctxKey: string): KindRef | undefined => {
  switch (ctxKey) {
    case "seg1":
      return "Segment";
    case "seg2":
      return "Segment<Table>";
    case "docA":
      return "Document";
    case "ocrX":
      return "OcrResult";
    default:
      return undefined;
  }
};

// ---------------------------------------------------------------------------
// Scenario 1: compatible-first sort + divider for incompatibles
// ---------------------------------------------------------------------------

describe("VariablePicker — Scenario 1: compatible-first + divider", () => {
  it("renders the `Incompatible with this port` divider with compatibles above and incompatibles below", () => {
    renderPicker(
      <VariablePicker
        config={makeFourVarConfig()}
        value=""
        onChange={() => undefined}
        expectedKind="Segment"
        resolveProducerKind={FOUR_VAR_RESOLVER}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    // The divider's label is visible.
    expect(screen.getByText("Incompatible with this port")).toBeInTheDocument();

    // Both compatibles render (seg1 + seg2).
    expect(
      screen.getByTestId("variable-picker-option-seg1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("variable-picker-option-seg2"),
    ).toBeInTheDocument();

    // Both incompatibles render (docA + ocrX) and carry the dim marker.
    const docAOption = screen.getByTestId("variable-picker-option-docA");
    const ocrXOption = screen.getByTestId("variable-picker-option-ocrX");
    expect(docAOption).toHaveAttribute("data-incompatible", "true");
    expect(ocrXOption).toHaveAttribute("data-incompatible", "true");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: incompatibles are dimmed + carry exact tooltip text;
//             clicking still binds the variable
// ---------------------------------------------------------------------------

describe("VariablePicker — Scenario 2: dim + tooltip + click-still-binds", () => {
  it("dims incompatible rows to opacity 0.5 and surfaces the exact reason tooltip text", () => {
    renderPicker(
      <VariablePicker
        config={makeFourVarConfig()}
        value=""
        onChange={() => undefined}
        expectedKind="Segment"
        resolveProducerKind={FOUR_VAR_RESOLVER}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    const docAOption = screen.getByTestId("variable-picker-option-docA");
    expect(docAOption).toHaveStyle({ opacity: 0.5 });
    expect(docAOption).toHaveAttribute(
      "data-incompatible-reason",
      "Document — incompatible with this port (expects Segment)",
    );

    const ocrXOption = screen.getByTestId("variable-picker-option-ocrX");
    expect(ocrXOption).toHaveAttribute(
      "data-incompatible-reason",
      "OcrResult — incompatible with this port (expects Segment)",
    );
  });

  it("clicking an incompatible row still fires onChange with the variable's ctx key", () => {
    const onChange = vi.fn();
    renderPicker(
      <VariablePicker
        config={makeFourVarConfig()}
        value=""
        onChange={onChange}
        expectedKind="Segment"
        resolveProducerKind={FOUR_VAR_RESOLVER}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));
    // Mantine renders each option as a clickable `[role="option"]`. The
    // dimmed `Text` is rendered inside that option, so clicking the text
    // bubbles to the option and selects it.
    fireEvent.click(screen.getByTestId("variable-picker-option-docA"));

    expect(onChange).toHaveBeenCalledWith("docA");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: no expectedKind → flat list, no divider, no dimming
// ---------------------------------------------------------------------------

describe("VariablePicker — Scenario 3: no expectedKind → legacy flat render", () => {
  it("renders without the `Incompatible with this port` divider when expectedKind is undefined", () => {
    renderPicker(
      <VariablePicker
        config={makeFourVarConfig()}
        value=""
        onChange={() => undefined}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    expect(
      screen.queryByText("Incompatible with this port"),
    ).not.toBeInTheDocument();
    // No row carries the dim marker.
    expect(
      screen.queryByTestId("variable-picker-option-docA"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: producer kind unknown → variable in compatible group
// ---------------------------------------------------------------------------

describe("VariablePicker — Scenario 4: unknown producer kind → compatible (Artifact wildcard)", () => {
  it("places a variable with no producer kind into the compatible bucket against a typed port", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "host",
      nodes: {
        host: {
          id: "host",
          type: "activity",
          label: "Host",
          activityType: "test.noop",
        },
      },
      edges: [],
      ctx: {
        legacyVar: { type: "object" },
      },
    };

    renderPicker(
      <VariablePicker
        config={config}
        value=""
        onChange={() => undefined}
        expectedKind="Document"
        resolveProducerKind={() => undefined}
        data-testid="picker"
      />,
    );

    fireEvent.click(screen.getByTestId("picker"));

    // The legacy variable is NOT incompatible — it has no `data-incompatible`
    // attribute and no `Incompatible with this port` divider appears
    // (incompatible bucket is empty).
    const opt = screen.getByTestId("variable-picker-option-legacyVar");
    expect(opt).not.toHaveAttribute("data-incompatible");
    expect(
      screen.queryByText("Incompatible with this port"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: picker re-sorts when expectedKind changes
// ---------------------------------------------------------------------------

describe("VariablePicker — Scenario 5: re-sort on expectedKind change", () => {
  it("flips compatibles/incompatibles when the parent flips expectedKind", () => {
    function Harness() {
      const [kind, setKind] = useState<KindRef>("Segment");
      return (
        <>
          <button
            type="button"
            data-testid="flip"
            onClick={() => setKind("Document")}
          >
            flip
          </button>
          <VariablePicker
            config={makeFourVarConfig()}
            value=""
            onChange={() => undefined}
            expectedKind={kind}
            resolveProducerKind={FOUR_VAR_RESOLVER}
            data-testid="picker"
          />
        </>
      );
    }

    renderPicker(<Harness />);

    fireEvent.click(screen.getByTestId("picker"));

    // With expectedKind="Segment": seg1, seg2 compatible; docA, ocrX
    // incompatible.
    expect(screen.getByTestId("variable-picker-option-docA")).toHaveAttribute(
      "data-incompatible",
      "true",
    );
    expect(
      screen.getByTestId("variable-picker-option-seg1"),
    ).not.toHaveAttribute("data-incompatible");

    // Flip to expectedKind="Document".
    fireEvent.click(screen.getByTestId("flip"));

    // Open the picker again (Mantine's dropdown may have closed on parent
    // re-render in some flows; fireEvent.click is idempotent for the
    // input).
    fireEvent.click(screen.getByTestId("picker"));

    // Now docA is compatible; seg1 / seg2 / ocrX are incompatible.
    expect(
      screen.getByTestId("variable-picker-option-docA"),
    ).not.toHaveAttribute("data-incompatible");
    expect(screen.getByTestId("variable-picker-option-seg1")).toHaveAttribute(
      "data-incompatible",
      "true",
    );
    expect(screen.getByTestId("variable-picker-option-seg2")).toHaveAttribute(
      "data-incompatible",
      "true",
    );
    expect(screen.getByTestId("variable-picker-option-ocrX")).toHaveAttribute(
      "data-incompatible",
      "true",
    );
  });
});
