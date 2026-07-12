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
});
