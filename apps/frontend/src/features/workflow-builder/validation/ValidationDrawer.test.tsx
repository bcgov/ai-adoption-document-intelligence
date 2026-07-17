import type {
  GraphValidationError,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphValidationResult } from "./useGraphValidation";
import { ValidationDrawer } from "./ValidationDrawer";

function makeResult(errors: GraphValidationError[]): GraphValidationResult {
  const errorsByNode = new Map<string, GraphValidationError[]>();
  const workflowLevelErrors: GraphValidationError[] = [];
  for (const e of errors) {
    const m = /^nodes\.([^.]+)/.exec(e.path);
    if (m) {
      const list = errorsByNode.get(m[1]) ?? [];
      list.push(e);
      errorsByNode.set(m[1], list);
    } else {
      workflowLevelErrors.push(e);
    }
  }
  return {
    errors,
    errorCount: errors.filter((e) => e.severity === "error").length,
    warningCount: errors.filter((e) => e.severity === "warning").length,
    errorsByNode,
    workflowLevelErrors,
    isPending: false,
  };
}

const config: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  nodes: {
    Z: {
      id: "Z",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Z",
    },
  },
  edges: [],
  entryNodeId: "Z",
  ctx: {},
};

function mount(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("ValidationDrawer", () => {
  it("deep-links an input-anchored issue to that input's picker via onFixNodeInput", () => {
    const onFixNodeInput = vi.fn();
    const onSelectNode = vi.fn();
    const onClose = vi.fn();
    mount(
      <ValidationDrawer
        opened
        onClose={onClose}
        result={makeResult([
          {
            path: "nodes.Z.inputs.fileData",
            message: 'Input "fileData" needs a source',
            severity: "warning",
          },
        ])}
        config={config}
        onSelectNode={onSelectNode}
        onFixNodeInput={onFixNodeInput}
      />,
    );
    fireEvent.click(screen.getByText(/needs a source/i));
    expect(onFixNodeInput).toHaveBeenCalledWith("Z", "fileData");
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to selecting the node for a non-input issue", () => {
    const onFixNodeInput = vi.fn();
    const onSelectNode = vi.fn();
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={makeResult([
          {
            path: "nodes.Z",
            message: "Node is not reachable from entry node",
            severity: "warning",
          },
        ])}
        config={config}
        onSelectNode={onSelectNode}
        onFixNodeInput={onFixNodeInput}
      />,
    );
    fireEvent.click(screen.getByText(/not reachable/i));
    expect(onSelectNode).toHaveBeenCalledWith("Z");
    expect(onFixNodeInput).not.toHaveBeenCalled();
  });

  it("shows a 'Pick a source' affordance on an input-anchored row", () => {
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={makeResult([
          {
            path: "nodes.Z.inputs.fileData",
            message: 'Input "fileData" needs a source',
            severity: "warning",
          },
        ])}
        config={config}
        onSelectNode={vi.fn()}
        onFixNodeInput={vi.fn()}
      />,
    );
    expect(screen.getByText(/pick a source/i)).toBeInTheDocument();
    expect(screen.queryByText(/select node/i)).not.toBeInTheDocument();
  });

  it("shows a 'Select node' affordance on a non-input row", () => {
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={makeResult([
          {
            path: "nodes.Z",
            message: "Node is not reachable from entry node",
            severity: "warning",
          },
        ])}
        config={config}
        onSelectNode={vi.fn()}
        onFixNodeInput={vi.fn()}
      />,
    );
    expect(screen.getByText(/select node/i)).toBeInTheDocument();
    expect(screen.queryByText(/pick a source/i)).not.toBeInTheDocument();
  });

  it("humanizes raw node IDs in a message into their node labels", () => {
    const reachabilityConfig: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        prepA: {
          id: "prepA",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Prepare A",
        },
        normB: {
          id: "normB",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Normalize B",
        },
      },
      edges: [],
      entryNodeId: "prepA",
      ctx: {},
    };
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={makeResult([
          {
            path: "nodes.normB",
            message: 'Node "normB" is not reachable from entry node "prepA"',
            severity: "warning",
          },
        ])}
        config={reachabilityConfig}
        onSelectNode={vi.fn()}
        onFixNodeInput={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Node "Normalize B" is not reachable from entry node "Prepare A"',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/"normB"|"prepA"/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Node-scoped (filtered) mode — clicking a canvas problems badge opens the
// drawer filtered to a single node, naming it, with a "Show all problems"
// escape hatch back to the global list.
// ---------------------------------------------------------------------------

const multiConfig: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  nodes: {
    Z: {
      id: "Z",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Submit OCR",
    },
    Q: {
      id: "Q",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "Other node",
    },
  },
  edges: [],
  entryNodeId: "Z",
  ctx: {},
};

describe("ValidationDrawer — node-scoped filter mode", () => {
  function twoNodeResult(): GraphValidationResult {
    return makeResult([
      {
        path: "nodes.Z.inputs.fileData",
        message: 'Input "fileData" needs a source',
        severity: "warning",
      },
      {
        path: "nodes.Z",
        message: "Node is not reachable from entry node",
        severity: "warning",
      },
      {
        path: "nodes.Q.inputs.fileData",
        message: "Q input needs a source",
        severity: "warning",
      },
      {
        path: "workflow.entry",
        message: "Workflow-level thing",
        severity: "error",
      },
    ]);
  }

  it("renders only the filtered node's issues, names the node, and hides workflow-level + other nodes", () => {
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={twoNodeResult()}
        config={multiConfig}
        onSelectNode={vi.fn()}
        onFixNodeInput={vi.fn()}
        filterNodeId="Z"
        onShowAll={vi.fn()}
      />,
    );
    // Title names the node.
    expect(screen.getByText("Problems on Submit OCR")).toBeInTheDocument();
    // Z's issues present.
    expect(screen.getByText(/"fileData" needs a source/)).toBeInTheDocument();
    expect(screen.getByText(/not reachable/i)).toBeInTheDocument();
    // Other node's + workflow-level issues absent.
    expect(
      screen.queryByText("Q input needs a source"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Workflow-level thing")).not.toBeInTheDocument();
  });

  it("offers a 'Show all problems' affordance that calls onShowAll", () => {
    const onShowAll = vi.fn();
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={twoNodeResult()}
        config={multiConfig}
        onSelectNode={vi.fn()}
        onFixNodeInput={vi.fn()}
        filterNodeId="Z"
        onShowAll={onShowAll}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /show all problems/i }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it("shows a friendly message when the filtered node has no issues", () => {
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={twoNodeResult()}
        config={multiConfig}
        onSelectNode={vi.fn()}
        onFixNodeInput={vi.fn()}
        filterNodeId="not-a-node"
        onShowAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/no problems on this node/i)).toBeInTheDocument();
  });

  it("drops the 'Select node' hint and is non-interactive for a non-input row in filtered mode", () => {
    const onSelectNode = vi.fn();
    const onClose = vi.fn();
    mount(
      <ValidationDrawer
        opened
        onClose={onClose}
        result={makeResult([
          {
            path: "nodes.Z",
            message: "Node is not reachable from entry node",
            severity: "warning",
          },
        ])}
        config={multiConfig}
        onSelectNode={onSelectNode}
        onFixNodeInput={vi.fn()}
        filterNodeId="Z"
        onShowAll={vi.fn()}
      />,
    );
    // Message still explains the problem.
    const msg = screen.getByText(/not reachable/i);
    expect(msg).toBeInTheDocument();
    // No redundant "Select node →" hint.
    expect(screen.queryByText(/select node/i)).not.toBeInTheDocument();
    // Row is not interactive (not rendered as a button).
    expect(msg.closest("button")).toBeNull();
    // Clicking does nothing.
    fireEvent.click(msg);
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the 'Pick a source' hint + picker deep-link for an input row in filtered mode", () => {
    const onFixNodeInput = vi.fn();
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={makeResult([
          {
            path: "nodes.Z.inputs.fileData",
            message: 'Input "fileData" needs a source',
            severity: "warning",
          },
        ])}
        config={multiConfig}
        onSelectNode={vi.fn()}
        onFixNodeInput={onFixNodeInput}
        filterNodeId="Z"
        onShowAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/pick a source/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/"fileData" needs a source/));
    expect(onFixNodeInput).toHaveBeenCalledWith("Z", "fileData");
  });

  it("keeps the 'Select node' hint + selection for a non-input row in unfiltered mode", () => {
    const onSelectNode = vi.fn();
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={makeResult([
          {
            path: "nodes.Z",
            message: "Node is not reachable from entry node",
            severity: "warning",
          },
        ])}
        config={multiConfig}
        onSelectNode={onSelectNode}
        onFixNodeInput={vi.fn()}
      />,
    );
    expect(screen.getByText(/select node/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/not reachable/i));
    expect(onSelectNode).toHaveBeenCalledWith("Z");
  });

  it("unfiltered mode still lists every node's bucket (regression)", () => {
    mount(
      <ValidationDrawer
        opened
        onClose={vi.fn()}
        result={twoNodeResult()}
        config={multiConfig}
        onSelectNode={vi.fn()}
        onFixNodeInput={vi.fn()}
      />,
    );
    expect(screen.getByText(/"fileData" needs a source/)).toBeInTheDocument();
    expect(screen.getByText("Q input needs a source")).toBeInTheDocument();
    expect(screen.getByText("Workflow-level thing")).toBeInTheDocument();
    // Default global title, no "Show all problems" button.
    expect(screen.getByText("Validation")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show all problems/i }),
    ).not.toBeInTheDocument();
  });
});
