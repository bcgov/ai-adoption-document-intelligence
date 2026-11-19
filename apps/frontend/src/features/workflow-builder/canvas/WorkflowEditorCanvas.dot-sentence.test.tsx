/**
 * The hover sentence on a card's own dots — run order in, run order out, and
 * the error path — and how it hands over to the extend picker.
 *
 * - The sentence is anchored on the dot's own element. jsdom has no layout,
 *   so the anchor is asserted as the tooltip's `target`.
 * - It is closed whenever an extend picker is open, so the two are never on
 *   screen together.
 * - A picker opened from the outgoing run-order dot repeats the dot's
 *   sentence at its top, since the dot's own tooltip has closed.
 *
 * Mantine's `Tooltip` is replaced by a recorder for its targeted form (the one
 * `CardDot` uses) and a passthrough otherwise; xyflow's `Handle` is a plain
 * div that forwards its ref and its hover handlers.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ActivityNode,
  GraphWorkflowConfig,
  MapNode,
} from "../../../types/workflow";
import { FLOW_HANDLE_TOOLTIP_IN, FLOW_HANDLE_TOOLTIP_OUT } from "./flow-handle";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock("../dynamic-nodes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../dynamic-nodes")>();
  return {
    ...actual,
    useActivityCatalog: () => ({ isLoading: false, entries: [], error: null }),
  };
});

interface RecordedTooltip {
  label: React.ReactNode;
  target: React.RefObject<HTMLElement | null>;
  position?: string;
  disabled?: boolean;
}

const { recordedTooltips } = vi.hoisted(() => ({
  recordedTooltips: { current: [] as RecordedTooltip[] },
}));

vi.mock("@mantine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/core")>();
  return {
    ...actual,
    Tooltip: (props: {
      children?: React.ReactNode;
      label: React.ReactNode;
      target?: React.RefObject<HTMLElement | null>;
      position?: string;
      disabled?: boolean;
    }) => {
      if (props.target) {
        recordedTooltips.current.push({
          label: props.label,
          target: props.target,
          position: props.position,
          disabled: props.disabled,
        });
        return null;
      }
      return <>{props.children}</>;
    },
  };
});

const { mockUpdateNodeInternals } = vi.hoisted(() => ({
  mockUpdateNodeInternals: vi.fn(),
}));

interface MockNodeProps {
  id: string;
  type: string;
  data: Record<string, unknown>;
  selected?: boolean;
}

vi.mock("@xyflow/react", () => {
  const useNodesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    return [state, setState, () => undefined] as const;
  };
  const useEdgesState = <T,>(initial: T[]) => {
    const [state, setState] = React.useState<T[]>(initial);
    return [state, setState, () => undefined] as const;
  };
  return {
    ReactFlow: (props: Record<string, unknown>) => {
      const nodes: MockNodeProps[] = (props.nodes as MockNodeProps[]) ?? [];
      const nodeTypes = props.nodeTypes as
        | Record<string, React.ComponentType<MockNodeProps>>
        | undefined;
      return (
        <div data-testid="react-flow">
          {nodes.map((n) => {
            const Renderer = nodeTypes?.[n.type];
            return Renderer ? (
              <div key={n.id} data-testid={`rf-node-${n.id}`}>
                <Renderer
                  id={n.id}
                  type={n.type}
                  data={n.data}
                  selected={n.selected ?? false}
                />
              </div>
            ) : null;
          })}
        </div>
      );
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Panel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Handle: ({
      ref,
      type,
      position,
      id,
      style,
      children,
      onMouseEnter,
      onMouseLeave,
    }: {
      ref?: React.Ref<HTMLDivElement>;
      type: string;
      position: string;
      id?: string;
      style?: React.CSSProperties;
      children?: React.ReactNode;
      onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
      onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
    }) => (
      <div
        ref={ref}
        data-testid={`handle-${type}-${position}`}
        data-handleid={id ?? null}
        style={style}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    ),
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useNodesState,
    useEdgesState,
    useReactFlow: () => ({
      fitView: vi.fn(),
      getNodes: () => [],
      setNodes: vi.fn(),
      screenToFlowPosition: (p: { x: number; y: number }) => p,
    }),
    useUpdateNodeInternals: () => mockUpdateNodeInternals,
  };
});

// eslint-disable-next-line import/first
import { WorkflowEditorCanvas } from "./WorkflowEditorCanvas";

function makeConfig(): GraphWorkflowConfig {
  const split: ActivityNode = {
    id: "splitDoc",
    type: "activity",
    label: "Split Document",
    activityType: "document.split",
    parameters: { strategy: "per-page" },
    errorPolicy: { retryable: false, onError: "fallback" },
    metadata: { position: { x: 0, y: 0 } },
  };
  const loop: MapNode = {
    id: "loopNode",
    type: "map",
    label: "Run for each item",
    collectionCtxKey: "",
    itemCtxKey: "",
    bodyEntryNodeId: "",
    bodyExitNodeId: "",
    metadata: { position: { x: 400, y: 0 } },
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "dots", version: "1.0.0" },
    ctx: {},
    nodes: { splitDoc: split, loopNode: loop },
    edges: [],
    entryNodeId: "splitDoc",
  };
}

function renderCanvas() {
  render(
    <MantineProvider>
      <WorkflowEditorCanvas
        config={makeConfig()}
        selectedNodeId={null}
        onConfigChange={vi.fn()}
        onSelectNode={vi.fn()}
      />
    </MantineProvider>,
  );
}

/** The dot inside one of the wrappers `CardDot` renders. */
function dotIn(wrapperTestId: string): HTMLElement {
  const dot = screen
    .getByTestId(wrapperTestId)
    .querySelector<HTMLElement>("[data-testid^='handle-']");
  if (!dot) throw new Error(`no dot in ${wrapperTestId}`);
  return dot;
}

/** The latest recorded state of the dot sentence anchored on `dot`. */
function sentenceOn(dot: HTMLElement): RecordedTooltip {
  const recorded = recordedTooltips.current.filter(
    (t) => t.target.current === dot,
  );
  const latest = recorded[recorded.length - 1];
  if (!latest) throw new Error("no sentence is anchored on this dot");
  return latest;
}

beforeEach(() => {
  recordedTooltips.current = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a card's own dots — the hover sentence", () => {
  it("anchors each dot's sentence on the dot itself, not on its wrapper", () => {
    renderCanvas();
    for (const [wrapper, sentence, side] of [
      ["flow-handle-tooltip-in-splitDoc", FLOW_HANDLE_TOOLTIP_IN, "left"],
      ["flow-handle-tooltip-out-splitDoc", FLOW_HANDLE_TOOLTIP_OUT, "right"],
      ["flow-handle-tooltip-in-loopNode", FLOW_HANDLE_TOOLTIP_IN, "left"],
      ["flow-handle-tooltip-out-loopNode", FLOW_HANDLE_TOOLTIP_OUT, "right"],
      [
        "error-handle-tooltip-splitDoc",
        "Error path: runs when this step fails",
        "bottom",
      ],
    ] as const) {
      const dot = dotIn(wrapper);
      const tooltip = sentenceOn(dot);
      expect(tooltip.label).toBe(sentence);
      expect(tooltip.position).toBe(side);
      expect(tooltip.target.current).not.toBe(screen.getByTestId(wrapper));
      expect(tooltip.disabled).toBe(false);
    }
  });

  it("closes every dot's sentence while the extend picker is open, and reopens it after", () => {
    vi.useFakeTimers();
    renderCanvas();
    const out = dotIn("flow-handle-tooltip-out-splitDoc");
    fireEvent.mouseEnter(out);
    // The picker waits 200 ms; until then the sentence is the only thing up.
    expect(screen.queryByTestId("hover-extend-popover")).toBeNull();
    expect(sentenceOn(out).disabled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
    for (const wrapper of [
      "flow-handle-tooltip-in-splitDoc",
      "flow-handle-tooltip-out-splitDoc",
      "flow-handle-tooltip-in-loopNode",
      "flow-handle-tooltip-out-loopNode",
      "error-handle-tooltip-splitDoc",
    ]) {
      expect(sentenceOn(dotIn(wrapper)).disabled, wrapper).toBe(true);
    }

    // Leaving the dot closes the picker after its grace period.
    fireEvent.mouseLeave(out);
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(screen.queryByTestId("hover-extend-popover")).toBeNull();
    expect(sentenceOn(out).disabled).toBe(false);
  });

  it("repeats the outgoing dot's sentence at the top of the picker it opens", () => {
    vi.useFakeTimers();
    renderCanvas();
    fireEvent.mouseEnter(dotIn("flow-handle-tooltip-out-splitDoc"));
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(
      screen.getByTestId("hover-extend-run-order-banner"),
    ).toHaveTextContent(FLOW_HANDLE_TOOLTIP_OUT);
    expect(screen.queryByTestId("hover-extend-error-path-banner")).toBeNull();
  });

  it("does not show the run-order banner on the picker the error dot opens", () => {
    vi.useFakeTimers();
    renderCanvas();
    fireEvent.mouseEnter(dotIn("error-handle-tooltip-splitDoc"));
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(
      screen.getByTestId("hover-extend-error-path-banner"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("hover-extend-run-order-banner")).toBeNull();
  });

  it("does not show the run-order banner on the picker a data port opens", () => {
    vi.useFakeTimers();
    renderCanvas();
    const segmentsDot = screen
      .getByTestId("port-row-splitDoc-out-segments")
      .querySelector<HTMLElement>("[data-handleid='out-segments']");
    if (!segmentsDot) throw new Error("no Segments dot");
    fireEvent.mouseEnter(segmentsDot);
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(screen.getByTestId("hover-extend-popover")).toBeInTheDocument();
    expect(screen.queryByTestId("hover-extend-run-order-banner")).toBeNull();
  });
});
