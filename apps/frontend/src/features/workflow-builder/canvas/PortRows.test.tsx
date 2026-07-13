/**
 * Unit tests for the `PortRows` component (PORT_WIRING_DESIGN.md,
 * port-row rendering slice).
 *
 * xyflow's `Handle` is mocked as a plain div carrying its wiring props as
 * data-* attributes — same harness pattern as
 * `WorkflowEditorCanvas.handle-style.test.tsx` — so the assertions can
 * probe handle ids, connectability, and inline style overrides directly.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import type { PortRowModel } from "./port-rows";
import { PORT_ROW_HEIGHT } from "./port-rows";

vi.mock("@xyflow/react", () => ({
  Handle: ({
    type,
    position,
    id,
    style,
    isConnectable,
  }: {
    type: string;
    position: string;
    id?: string;
    style?: React.CSSProperties;
    isConnectable?: boolean;
  }) => (
    <div
      data-testid={`handle-${type}-${position}`}
      data-handleid={id ?? null}
      data-isconnectable={isConnectable === false ? "false" : "true"}
      style={style}
    />
  ),
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

// eslint-disable-next-line import/first
import { PortRows } from "./PortRows";

function makeRow(overrides: Partial<PortRowModel>): PortRowModel {
  return {
    name: "source",
    label: "Source",
    description: undefined,
    kind: "MultiPageDocument",
    direction: "input",
    required: true,
    handleId: "in-source",
    bound: true,
    fromCtx: undefined,
    needsSource: false,
    ...overrides,
  };
}

function renderRows(inputs: PortRowModel[], outputs: PortRowModel[]) {
  return render(
    <MantineProvider>
      <PortRows nodeId="node_1" inputs={inputs} outputs={outputs} />
    </MantineProvider>,
  );
}

describe("PortRows — empty state", () => {
  it("renders nothing when both port lists are empty", () => {
    const { container } = renderRows([], []);
    expect(container.querySelector("[data-testid^='port-rows-']")).toBeNull();
    expect(container.querySelector("[data-testid^='port-row-']")).toBeNull();
  });
});

describe("PortRows — row rendering", () => {
  it("renders the grid + one row per port with data attributes and PORT_ROW_HEIGHT rows", () => {
    renderRows(
      [makeRow({})],
      [
        makeRow({
          name: "segments",
          label: "Segments",
          kind: "Segment[]",
          direction: "output",
          handleId: "out-segments",
        }),
      ],
    );

    expect(screen.getByTestId("port-rows-node_1")).toBeInTheDocument();

    const inputRow = screen.getByTestId("port-row-node_1-in-source");
    expect(inputRow.getAttribute("data-port-kind")).toBe("MultiPageDocument");
    expect(inputRow.getAttribute("data-needs-source")).toBe("false");
    expect(inputRow).toHaveTextContent("Source");
    expect(inputRow.style.height).toBe(`${PORT_ROW_HEIGHT}px`);

    const outputRow = screen.getByTestId("port-row-node_1-out-segments");
    expect(outputRow.getAttribute("data-port-kind")).toBe("Segment[]");
    expect(outputRow).toHaveTextContent("Segments");
  });

  it("renders undefined kinds as the Artifact wildcard", () => {
    renderRows([makeRow({ kind: undefined })], []);
    const row = screen.getByTestId("port-row-node_1-in-source");
    expect(row.getAttribute("data-port-kind")).toBe("Artifact");
  });
});

describe("PortRows — per-port handles (render-only phase)", () => {
  it("mounts a non-connectable target/source handle per row with the row's handle id", () => {
    const { container } = renderRows(
      [makeRow({})],
      [
        makeRow({
          name: "segments",
          label: "Segments",
          kind: "Segment[]",
          direction: "output",
          handleId: "out-segments",
        }),
      ],
    );

    const inputHandle = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    expect(inputHandle).not.toBeNull();
    expect(inputHandle.getAttribute("data-testid")).toBe("handle-target-left");
    expect(inputHandle.getAttribute("data-isconnectable")).toBe("false");

    const outputHandle = container.querySelector(
      "[data-handleid='out-segments']",
    ) as HTMLElement;
    expect(outputHandle).not.toBeNull();
    expect(outputHandle.getAttribute("data-testid")).toBe(
      "handle-source-right",
    );
    expect(outputHandle.getAttribute("data-isconnectable")).toBe("false");
  });

  it("colours the handle dot by kind family (gray for the Artifact wildcard)", () => {
    const { container } = renderRows(
      [
        makeRow({}),
        makeRow({
          name: "meta",
          label: "Meta",
          kind: "Artifact",
          handleId: "in-meta",
        }),
      ],
      [],
    );

    const typed = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    // MultiPageDocument resolves to the blue kind family.
    expect(typed.style.background).toContain("--mantine-color-blue-6");

    const wildcard = container.querySelector(
      "[data-handleid='in-meta']",
    ) as HTMLElement;
    expect(wildcard.style.background).toContain("--mantine-color-gray-6");
  });

  it("adds the doubled outline only for array kinds", () => {
    const { container } = renderRows(
      [makeRow({})],
      [
        makeRow({
          name: "segments",
          label: "Segments",
          kind: "Segment[]",
          direction: "output",
          handleId: "out-segments",
        }),
      ],
    );

    const arrayHandle = container.querySelector(
      "[data-handleid='out-segments']",
    ) as HTMLElement;
    expect(arrayHandle.style.outline).toContain("2px solid");

    const scalarHandle = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    expect(scalarHandle.style.outline).toBe("");
  });

  it("renders the amber ring only when needsSource is set", () => {
    const { container } = renderRows(
      [
        makeRow({ needsSource: true }),
        makeRow({
          name: "options",
          label: "Options",
          required: false,
          handleId: "in-options",
        }),
      ],
      [],
    );

    const needy = screen.getByTestId("port-row-node_1-in-source");
    expect(needy.getAttribute("data-needs-source")).toBe("true");
    const needyHandle = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    expect(needyHandle.style.boxShadow).toContain("yellow");

    const satisfied = screen.getByTestId("port-row-node_1-in-options");
    expect(satisfied.getAttribute("data-needs-source")).toBe("false");
    const satisfiedHandle = container.querySelector(
      "[data-handleid='in-options']",
    ) as HTMLElement;
    expect(satisfiedHandle.style.boxShadow).toBe("");
  });
});

describe("PortRows — labels and ctx provenance", () => {
  it("renders the plain-language label plus an italic `· from <ctxKey>` suffix when fromCtx is set", () => {
    renderRows(
      [
        makeRow({
          fromCtx: "invoiceUrl",
        }),
      ],
      [],
    );

    const row = screen.getByTestId("port-row-node_1-in-source");
    expect(row.getAttribute("data-from-ctx")).toBe("invoiceUrl");
    expect(row).toHaveTextContent("Source");
    expect(row).toHaveTextContent("· from invoiceUrl");
  });

  it("omits the fromCtx suffix and attribute when the port is wire-bound", () => {
    renderRows([makeRow({})], []);
    const row = screen.getByTestId("port-row-node_1-in-source");
    expect(row.hasAttribute("data-from-ctx")).toBe(false);
    expect(row).not.toHaveTextContent("· from");
  });
});
