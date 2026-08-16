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
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { portDotColor } from "./artifact-kind-colour";
import { BASE_HANDLE_SIZE } from "./handle-style";
import type { PortRowModel } from "./port-rows";
import { PORT_ROW_HEIGHT } from "./port-rows";

/**
 * jsdom's CSSOM normalises every colour it parses to `rgb(r, g, b)`, so the
 * literal family hexes the canvas now paints (item 20 — they are literals
 * precisely because the app theme overrides Mantine's scales) read back in
 * that form. This converts a hex from the shared palette into what jsdom
 * reports, so the assertions below compare against `portDotColor(...)`
 * instead of pasting a colour the palette would then own in two places.
 */
function rgbOf(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) =>
    Number.parseInt(value.slice(i, i + 2), 16),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

// Replace Mantine's Tooltip with a passthrough that stamps its `position` on a
// wrapper element. Mantine 8 resolves tooltip placement through floating-ui at
// hover time and never surfaces the requested `position` as a queryable DOM
// attribute, so this is the only reliable way to assert placement in jsdom. The
// wrapper renders children verbatim, so every other assertion (row divs,
// handles, data-* attributes) is unaffected.
vi.mock("@mantine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/core")>();
  return {
    ...actual,
    Tooltip: ({
      children,
      position,
      label,
    }: {
      children: React.ReactNode;
      position?: string;
      label?: React.ReactNode;
    }) => (
      // The label is stamped as well as the position (D28c asserts the copy
      // that explains the enlarged dot); every label this component passes
      // is a plain string.
      <div
        data-tooltip-position={position}
        data-tooltip-label={typeof label === "string" ? label : undefined}
      >
        {children}
      </div>
    ),
  };
});

// The mock forwards `children` because the real xyflow `Handle` does
// (`HandleComponent` spreads them into the dot element) — that is how the
// "+" invitation's two bars end up inside the dot.
vi.mock("@xyflow/react", () => ({
  Handle: ({
    type,
    position,
    id,
    style,
    isConnectable,
    onMouseEnter,
    onMouseLeave,
    children,
  }: {
    type: string;
    position: string;
    id?: string;
    style?: React.CSSProperties;
    isConnectable?: boolean;
    onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid={`handle-${type}-${position}`}
      data-handleid={id ?? null}
      data-isconnectable={isConnectable === false ? "false" : "true"}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  ),
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

// eslint-disable-next-line import/first
import { PortDragContext, PortRows } from "./PortRows";

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
    // Default rows are connected, so the "+" invitation is opt-in per test.
    connected: true,
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

function renderRowsWithDrag(
  inputs: PortRowModel[],
  outputs: PortRowModel[],
  dragValue: { sourceKind: PortRowModel["kind"] } | null,
) {
  return render(
    <MantineProvider>
      <PortDragContext.Provider value={dragValue}>
        <PortRows nodeId="node_1" inputs={inputs} outputs={outputs} />
      </PortDragContext.Provider>
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

describe("PortRows — per-port handles (drag-to-bind, §6.1)", () => {
  it("mounts a connectable target/source handle per row with the row's handle id", () => {
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
    expect(inputHandle.getAttribute("data-isconnectable")).toBe("true");

    const outputHandle = container.querySelector(
      "[data-handleid='out-segments']",
    ) as HTMLElement;
    expect(outputHandle).not.toBeNull();
    expect(outputHandle.getAttribute("data-testid")).toBe(
      "handle-source-right",
    );
    expect(outputHandle.getAttribute("data-isconnectable")).toBe("true");
  });

  it("colours AND shapes the handle dot by kind family (gray hollow for the Artifact wildcard)", () => {
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

    // The row stamps both halves of the signal — `data-port-color` and
    // `data-port-shape` — which is the assertion the canvas actually owes:
    // since item 20 every family carries a non-chromatic silhouette so hue is
    // never the only thing telling two ports apart.
    const typedRow = screen.getByTestId("port-row-node_1-in-source");
    expect(typedRow.getAttribute("data-port-color")).toBe("blue");
    expect(typedRow.getAttribute("data-port-shape")).toBe("circle");
    const typed = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    // MultiPageDocument resolves to the blue "Documents & files" family.
    expect(typed.style.background).toBe(rgbOf(portDotColor("blue")));

    const wildcardRow = screen.getByTestId("port-row-node_1-in-meta");
    expect(wildcardRow.getAttribute("data-port-color")).toBe("gray");
    expect(wildcardRow.getAttribute("data-port-shape")).toBe("hollow");
    const wildcard = container.querySelector(
      "[data-handleid='in-meta']",
    ) as HTMLElement;
    // Gray is the one family that is NOT filled: the untyped dot empties its
    // middle to the canvas body colour and spends its border on the family
    // colour, which is what "takes anything" should look like. So the family
    // hex is on the border here, not on the background.
    expect(wildcard.style.background).toContain("--mantine-color-body");
    expect(wildcard.style.border).toContain(rgbOf(portDotColor("gray")));
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

describe("PortRows — connect-time drop-target highlight (§6.2)", () => {
  it("stamps data-drop-compatible on input rows during a port drag; output rows carry no attribute", () => {
    renderRowsWithDrag(
      [
        makeRow({ kind: "Document" }), // assignable — identity match
        makeRow({
          name: "segments",
          label: "Segments",
          kind: "Segment[]",
          handleId: "in-segments",
        }), // incompatible — cardinality mismatch vs a scalar Document source
      ],
      [
        makeRow({
          name: "out1",
          label: "Out1",
          direction: "output",
          handleId: "out-out1",
          kind: "Document",
        }),
      ],
      { sourceKind: "Document" },
    );

    const compatible = screen.getByTestId("port-row-node_1-in-source");
    expect(compatible.getAttribute("data-drop-compatible")).toBe("true");

    const incompatible = screen.getByTestId("port-row-node_1-in-segments");
    expect(incompatible.getAttribute("data-drop-compatible")).toBe("false");
    // Pin the dim itself, not just the classification attribute.
    expect(incompatible).toHaveStyle({ opacity: "0.35" });
    expect(compatible).not.toHaveStyle({ opacity: "0.35" });

    const output = screen.getByTestId("port-row-node_1-out-out1");
    expect(output.hasAttribute("data-drop-compatible")).toBe(false);
  });

  it("renders without the attribute when no drag is in progress", () => {
    renderRowsWithDrag([makeRow({})], [], null);
    const row = screen.getByTestId("port-row-node_1-in-source");
    expect(row.hasAttribute("data-drop-compatible")).toBe(false);

    // Same holds with no provider mounted at all.
    renderRows([makeRow({})], []);
    const rows = screen.getAllByTestId("port-row-node_1-in-source");
    for (const r of rows) {
      expect(r.hasAttribute("data-drop-compatible")).toBe(false);
    }
  });

  it("wildcard Artifact input rows always read compatible during a drag", () => {
    renderRowsWithDrag(
      [makeRow({ kind: "Artifact" })],
      [],
      { sourceKind: "Segment[]" }, // deliberately unrelated to Artifact's usual family
    );
    const row = screen.getByTestId("port-row-node_1-in-source");
    expect(row.getAttribute("data-drop-compatible")).toBe("true");
  });
});

describe("PortRows — output-handle hover-extend callbacks (§9)", () => {
  function renderWithHover(
    onOutputHandleEnter: (
      nodeId: string,
      portName: string,
      anchor: { x: number; y: number },
    ) => void,
    onOutputHandleLeave: () => void,
  ) {
    return render(
      <MantineProvider>
        <PortRows
          nodeId="node_1"
          inputs={[makeRow({})]}
          outputs={[
            makeRow({
              name: "preparedData",
              label: "Prepared",
              kind: "Document",
              direction: "output",
              handleId: "out-preparedData",
            }),
          ]}
          onOutputHandleEnter={onOutputHandleEnter}
          onOutputHandleLeave={onOutputHandleLeave}
        />
      </MantineProvider>,
    );
  }

  it("fires onOutputHandleEnter(nodeId, portName, anchor) on an output handle mouseenter", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderWithHover(onEnter, onLeave);
    const outputHandle = container.querySelector(
      "[data-handleid='out-preparedData']",
    ) as HTMLElement;
    fireEvent.mouseEnter(outputHandle);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0][0]).toBe("node_1");
    expect(onEnter.mock.calls[0][1]).toBe("preparedData");
    expect(onEnter.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
  });

  it("fires onOutputHandleLeave on an output handle mouseleave", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderWithHover(onEnter, onLeave);
    const outputHandle = container.querySelector(
      "[data-handleid='out-preparedData']",
    ) as HTMLElement;
    fireEvent.mouseLeave(outputHandle);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("does not fire the output callbacks from an input handle", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderWithHover(onEnter, onLeave);
    const inputHandle = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    fireEvent.mouseEnter(inputHandle);
    fireEvent.mouseLeave(inputHandle);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UX walkthrough 2026-07-29 — input-handle hover-extend callbacks,
// the upstream mirror of §9: hovering a typed INPUT dot must report the
// node + port so the canvas can open the producer-filtered popover.
// ---------------------------------------------------------------------------

describe("PortRows — input-handle hover-extend callbacks (upstream)", () => {
  function renderWithInputHover(
    onInputHandleEnter: (
      nodeId: string,
      portName: string,
      anchor: { x: number; y: number },
    ) => void,
    onInputHandleLeave: () => void,
  ) {
    return render(
      <MantineProvider>
        <PortRows
          nodeId="node_1"
          inputs={[makeRow({})]}
          outputs={[
            makeRow({
              name: "preparedData",
              label: "Prepared",
              kind: "Document",
              direction: "output",
              handleId: "out-preparedData",
            }),
          ]}
          onInputHandleEnter={onInputHandleEnter}
          onInputHandleLeave={onInputHandleLeave}
        />
      </MantineProvider>,
    );
  }

  it("fires onInputHandleEnter(nodeId, portName, anchor) on an input handle mouseenter", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderWithInputHover(onEnter, onLeave);
    const inputHandle = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    fireEvent.mouseEnter(inputHandle);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0][0]).toBe("node_1");
    expect(onEnter.mock.calls[0][1]).toBe("source");
    expect(onEnter.mock.calls[0][2]).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("fires onInputHandleLeave on an input handle mouseleave", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderWithInputHover(onEnter, onLeave);
    const inputHandle = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    fireEvent.mouseLeave(inputHandle);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("does not fire the input callbacks from an output handle", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderWithInputHover(onEnter, onLeave);
    const outputHandle = container.querySelector(
      "[data-handleid='out-preparedData']",
    ) as HTMLElement;
    fireEvent.mouseEnter(outputHandle);
    fireEvent.mouseLeave(outputHandle);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });
});

describe("PortRows — tooltip trigger is scoped off the handle", () => {
  // The hover-extend popover opens on an OUTPUT handle's hover. If the port
  // tooltip also fired on that same hover the two would render on top of each
  // other (overlap varies with canvas zoom). The tooltip must therefore wrap
  // ONLY the label, never the handle — so a handle hover shows just the picker.
  it("keeps the output handle outside the tooltip target, with the label inside it", () => {
    const { container } = renderRows(
      [makeRow({})],
      [
        makeRow({
          name: "preparedData",
          label: "Prepared",
          kind: "Document",
          direction: "output",
          handleId: "out-preparedData",
        }),
      ],
    );

    const handle = container.querySelector(
      "[data-handleid='out-preparedData']",
    ) as HTMLElement;
    // The handle must NOT be nested inside any tooltip target — otherwise its
    // hover would open the tooltip on top of the extend popover.
    expect(handle.closest("[data-tooltip-position]")).toBeNull();

    // The label text, by contrast, IS inside the tooltip target.
    const label = screen.getByText("Prepared");
    expect(label.closest("[data-tooltip-position]")).not.toBeNull();
  });

  it("does the same for input rows (handle out, label in)", () => {
    const { container } = renderRows([makeRow({ label: "Source" })], []);
    const handle = container.querySelector(
      "[data-handleid='in-source']",
    ) as HTMLElement;
    expect(handle.closest("[data-tooltip-position]")).toBeNull();
    expect(
      screen.getByText("Source").closest("[data-tooltip-position]"),
    ).not.toBeNull();
  });

  it("points the tooltip outward: left for inputs, right for outputs", () => {
    renderRows(
      [makeRow({ label: "Source" })],
      [
        makeRow({
          name: "preparedData",
          label: "Prepared",
          direction: "output",
          handleId: "out-preparedData",
        }),
      ],
    );
    expect(
      screen
        .getByText("Source")
        .closest("[data-tooltip-position]")
        ?.getAttribute("data-tooltip-position"),
    ).toBe("left");
    expect(
      screen
        .getByText("Prepared")
        .closest("[data-tooltip-position]")
        ?.getAttribute("data-tooltip-position"),
    ).toBe("right");
  });
});

describe("PortRows — the '+' invitation on unconnected ports (Inderdeep item 3)", () => {
  /**
   * A bare circle carries no invitation, so the hover-to-extend popover —
   * the main way a graph gets built — was undiscoverable to anyone handed
   * the tool cold. Unconnected, non-optional ports now draw a "+" inside
   * the dot: two knockout bars in the body colour, so the port's family
   * colour (which encodes what can connect to what) is untouched.
   */
  function handleOf(container: HTMLElement, handleId: string): HTMLElement {
    const el = container.querySelector(`[data-handleid='${handleId}']`);
    expect(el).not.toBeNull();
    return el as HTMLElement;
  }

  function plusBars(handle: HTMLElement): HTMLElement[] {
    return Array.from(handle.querySelectorAll("[data-port-plus]"));
  }

  it("draws the plus on a required unconnected input and on a required unconnected output", () => {
    const { container } = renderRows(
      [makeRow({ connected: false, needsSource: true })],
      [
        makeRow({
          name: "segments",
          label: "Segments",
          kind: "Segment[]",
          direction: "output",
          handleId: "out-segments",
          connected: false,
        }),
      ],
    );

    for (const handleId of ["in-source", "out-segments"]) {
      const handle = handleOf(container, handleId);
      const bars = plusBars(handle);
      expect(bars).toHaveLength(2);
      // One 8×2 bar and one 2×8 bar, centred — a plus, not a dot.
      expect(
        bars.map((bar) => `${bar.style.width}/${bar.style.height}`),
      ).toEqual(["8px/2px", "2px/8px"]);
      for (const bar of bars) {
        expect(bar.style.background).toContain("--mantine-color-body");
        expect(bar.style.transform).toBe("translate(-50%, -50%)");
        // Decoration inside a drag target must not eat the pointer.
        expect(bar.style.pointerEvents).toBe("none");
      }
    }

    expect(
      screen
        .getByTestId("port-row-node_1-in-source")
        .getAttribute("data-invites-connection"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("port-row-node_1-out-segments")
        .getAttribute("data-invites-connection"),
    ).toBe("true");
  });

  it("grows the inviting dot to 16px so the glyph survives at working zoom", () => {
    // The batch-1 status-badge finding: a glyph inside a ring loses at 16px
    // because the ring eats the pixel budget. The plus is therefore not
    // squeezed into the base 12px dot — the dot grows, leaving a 12px
    // coloured disc inside the 2px body ring for an 8px plus to sit in.
    const { container } = renderRows(
      [makeRow({ connected: false, needsSource: true })],
      [],
    );
    const handle = handleOf(container, "in-source");
    expect(handle.style.width).toBe("16px");
    expect(handle.style.height).toBe("16px");
  });

  it("leaves the family colour alone — the plus never repaints the dot", () => {
    const { container } = renderRows(
      [makeRow({ connected: false, needsSource: true })],
      [],
    );
    // MultiPageDocument is the blue family; an inviting port still says so.
    expect(handleOf(container, "in-source").style.background).toBe(
      rgbOf(portDotColor("blue")),
    );
    // …and it still says so with its silhouette too — the "+" is drawn inside
    // the family shape, it does not replace it.
    expect(
      screen
        .getByTestId("port-row-node_1-in-source")
        .getAttribute("data-port-shape"),
    ).toBe("circle");
  });

  it("draws no plus on a connected port, at the base dot size", () => {
    const { container } = renderRows(
      [makeRow({ connected: true })],
      [
        makeRow({
          name: "segments",
          label: "Segments",
          direction: "output",
          handleId: "out-segments",
          connected: true,
        }),
      ],
    );

    for (const handleId of ["in-source", "out-segments"]) {
      const handle = handleOf(container, handleId);
      expect(plusBars(handle)).toHaveLength(0);
      // The dot stays at the BASE size — it only grows to carry the "+" or to
      // flag a live drop target. Since item 20 that size is stamped inline
      // rather than left to the stylesheet: `portShapeStyle` has to size every
      // silhouette itself (a bar is 0.67×1.17 of the base, a diamond 0.84),
      // so the base dot now renders an explicit 12px instead of an empty
      // inline width.
      expect(handle.style.width).toBe(`${BASE_HANDLE_SIZE}px`);
      expect(handle.style.height).toBe(`${BASE_HANDLE_SIZE}px`);
    }
    expect(
      screen
        .getByTestId("port-row-node_1-in-source")
        .getAttribute("data-invites-connection"),
    ).toBe("false");
  });

  it("draws no plus on an optional unconnected port", () => {
    // Inviting a user to fill in something the workflow does not need is the
    // opposite of guidance, so `required: false` keeps the plain circle.
    const { container } = renderRows(
      [makeRow({ required: false, connected: false })],
      [],
    );
    expect(plusBars(handleOf(container, "in-source"))).toHaveLength(0);
    expect(
      screen
        .getByTestId("port-row-node_1-in-source")
        .getAttribute("data-invites-connection"),
    ).toBe("false");
  });

  it("keeps the amber needs-source ring alongside the plus", () => {
    // Two cues, two messages: the ring says "this is missing", the plus says
    // "here is how to fix it". They must coexist on the same dot.
    const { container } = renderRows(
      [makeRow({ connected: false, needsSource: true })],
      [],
    );
    const handle = handleOf(container, "in-source");
    expect(handle.style.boxShadow).toContain("yellow");
    expect(plusBars(handle)).toHaveLength(2);
  });
});

describe("PortRows — the enlarged dot explains itself (D28c)", () => {
  /**
   * *"Is there meaning behind the difference in the size of the Poll status
   * connector?"* — yes, and until now nothing said so anywhere: the dot grew
   * 4px and gained a glyph that reads as a smudge at working zoom. The row's
   * own tooltip now carries the sentence, because the dot's hover is already
   * spoken for by the extend picker.
   */
  function labelTooltip(handleId: string): string | null {
    const row = screen.getByTestId(`port-row-node_1-${handleId}`);
    const wrapper = row.querySelector("[data-tooltip-label]");
    return wrapper?.getAttribute("data-tooltip-label") ?? null;
  }

  it("says nothing extra on a port that is already connected", () => {
    renderRows([makeRow({ description: "Storage key for the PDF" })], []);
    expect(labelTooltip("in-source")).toBe(
      "source: MultiPageDocument — Storage key for the PDF",
    );
  });

  it("tells an unconnected required INPUT what the bigger dot is for", () => {
    renderRows([makeRow({ connected: false, needsSource: true })], []);
    expect(labelTooltip("in-source")).toContain(
      "Nothing is connected here yet — the larger dot with a + is where to drop a wire.",
    );
  });

  it("words it the other way round for an OUTPUT — nothing READS it yet", () => {
    renderRows(
      [],
      [
        makeRow({
          name: "status",
          label: "Poll status",
          kind: "Artifact",
          direction: "output",
          handleId: "out-status",
          connected: false,
        }),
      ],
    );
    // Dylan's own port, from `azureOcr.poll`.
    expect(labelTooltip("out-status")).toContain(
      "Nothing reads this yet — the larger dot with a + is where to drag one from.",
    );
  });

  it("does not double the full stop when the description already ends in one", () => {
    renderRows(
      [],
      [
        makeRow({
          name: "segments",
          label: "Segments",
          description: "List of produced segments.",
          kind: "Segment[]",
          direction: "output",
          handleId: "out-segments",
          connected: false,
        }),
      ],
    );
    expect(labelTooltip("out-segments")).toBe(
      "segments: Segment[] — List of produced segments. Nothing reads this yet — the larger dot with a + is where to drag one from.",
    );
  });

  it("stays silent on an optional unconnected port, like the glyph does", () => {
    renderRows([makeRow({ required: false, connected: false })], []);
    expect(labelTooltip("in-source")).toBe("source: MultiPageDocument");
  });
});
