/**
 * Restoring a version while the canvas has unsaved edits.
 *
 * The confirm says unsaved canvas changes will be discarded and the toast says
 * the editor is on the new version, so after a restore the canvas must hold
 * the restored steps, there must be nothing to undo back into, and the next
 * Save must store the restored steps.
 *
 * The workflow query here is a real TanStack query over a fake server, not a
 * fixed return value, because what is under test is how the page moves
 * between versions through that cache. The fake server can hold a refetch
 * open, which is how the page meets it in the browser: the restore's own
 * refetch is still in flight when the mutation resolves.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  UpdateWorkflowDto,
  WorkflowInfo,
  WorkflowVersionSummary,
} from "../../../../data/hooks/useWorkflows";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  SourceNode,
} from "../../../../types/workflow";

// ---------------------------------------------------------------------------
// Fixtures: v1 = Upload → Mark A; v2 adds Mark B after Mark A.
// ---------------------------------------------------------------------------

const upload: SourceNode = {
  id: "upload1",
  type: "source",
  label: "Upload",
  sourceType: "source.upload",
  parameters: {},
  metadata: { position: { x: 0, y: 0 } },
};
const mark = (id: string, label: string, x: number): ActivityNode => ({
  id,
  type: "activity",
  label,
  activityType: "document.updateStatus",
  inputs: [],
  outputs: [],
  parameters: { status: "ongoing_ocr" },
  metadata: { position: { x, y: 0 } },
});
const v1Config: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "Restore test" },
  entryNodeId: "upload1",
  ctx: {},
  nodes: { upload1: upload, markA: mark("markA", "Mark A", 400) },
  edges: [
    { id: "upload1-markA", type: "normal", source: "upload1", target: "markA" },
  ],
};
const v2Config: GraphWorkflowConfig = {
  ...v1Config,
  nodes: { ...v1Config.nodes, markB: mark("markB", "Mark B", 800) },
  edges: [
    ...v1Config.edges,
    { id: "markA-markB", type: "normal", source: "markA", target: "markB" },
  ],
};
const head = (version: number, config: GraphWorkflowConfig): WorkflowInfo => ({
  id: "wf-1",
  workflowVersionId: `v${version}-id`,
  slug: "restore-test",
  name: "Restore test",
  description: null,
  actorId: "actor-1",
  config,
  schemaVersion: "1.0",
  version,
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
});
const versions: WorkflowVersionSummary[] = [
  { id: "v2-id", versionNumber: 2, createdAt: "2026-10-20T10:00:00.000Z" },
  { id: "v1-id", versionNumber: 1, createdAt: "2026-10-19T10:00:00.000Z" },
];

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { server, capturedCanvasProps, notificationsShowMock } = vi.hoisted(
  () => ({
    server: {
      head: null as WorkflowInfo | null,
      /** While set, every workflow fetch waits on it. */
      gate: null as Promise<void> | null,
      revertResult: null as WorkflowInfo | Error | null,
      saves: [] as Array<{ id: string; dto: UpdateWorkflowDto }>,
    },
    capturedCanvasProps: { current: null as null | Record<string, unknown> },
    notificationsShowMock: vi.fn(),
  }),
);

vi.mock("../../dynamic-nodes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../dynamic-nodes")>();
  return {
    ...actual,
    useActivityCatalog: () => ({ isLoading: false, entries: [], error: null }),
  };
});

vi.mock("@mantine/notifications", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@mantine/notifications")>();
  return {
    ...original,
    notifications: { ...original.notifications, show: notificationsShowMock },
  };
});

vi.mock("../../canvas/WorkflowEditorCanvas", () => ({
  WorkflowEditorCanvas: (props: Record<string, unknown>) => {
    capturedCanvasProps.current = props;
    const config = props.config as GraphWorkflowConfig;
    return (
      <div
        data-testid="canvas-stub"
        data-nodes={Object.keys(config.nodes).sort().join(",")}
      />
    );
  },
}));
vi.mock("../../palette/ActivityPalette", () => ({
  ActivityPalette: () => <div data-testid="palette-stub" />,
}));
vi.mock("../../settings/NodeSettingsPanel", () => ({
  NodeSettingsPanel: () => <div data-testid="node-settings-stub" />,
}));
vi.mock("../../settings/WorkflowSettingsDrawer", () => ({
  WorkflowSettingsDrawer: () => null,
}));
vi.mock("../../validation/ValidationDrawer", () => ({
  ValidationDrawer: () => null,
}));
vi.mock("../../validation/useGraphValidation", () => ({
  useGraphValidation: () => ({
    errorCount: 0,
    warningCount: 0,
    isPending: false,
    errorsByNode: new Map(),
    errors: [],
  }),
}));

vi.mock("../../../../data/hooks/useWorkflows", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../data/hooks/useWorkflows")
    >();
  const { useQuery, useQueryClient } = await import("@tanstack/react-query");
  return {
    ...actual,
    useWorkflows: () => ({ data: [], isLoading: false }),
    useWorkflow: (id: string) =>
      useQuery({
        queryKey: ["workflow", id],
        queryFn: async () => {
          if (server.gate) await server.gate;
          if (!server.head) throw new Error("no head");
          return server.head;
        },
        enabled: !!id,
      }),
    useCreateWorkflow: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateWorkflow: () => ({
      mutateAsync: async ({
        id,
        dto,
      }: {
        id: string;
        dto: UpdateWorkflowDto;
      }) => {
        server.saves.push({ id, dto });
        return {
          workflow: server.head,
          validation: { valid: true, errors: [] },
        };
      },
      isPending: false,
    }),
    // Same cache effect as the real hook: the new head comes back as the
    // response, and the workflow query is invalidated without being awaited.
    useRevertWorkflowHead: () => {
      const queryClient = useQueryClient();
      return {
        mutateAsync: async (vars: {
          lineageId: string;
          workflowVersionId: string;
        }) => {
          const result = server.revertResult;
          if (result instanceof Error) throw result;
          if (!result) throw new Error("no revert result set");
          server.head = result;
          void queryClient.invalidateQueries({
            queryKey: ["workflow", vars.lineageId],
          });
          return result;
        },
        isPending: false,
      };
    },
    useWorkflowRunSpec: () => ({ data: undefined, isLoading: false }),
    useStartWorkflowRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useWorkflowVersion: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
    }),
    useWorkflowVersions: () => ({
      data: versions,
      isLoading: false,
      isError: false,
      error: null,
    }),
  };
});

import { WorkflowEditorV2Page } from "../../WorkflowEditorV2Page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <RouterProvider
            router={createMemoryRouter(
              [
                {
                  path: "/workflows/:workflowId/edit",
                  element: <WorkflowEditorV2Page mode="edit" />,
                },
              ],
              { initialEntries: ["/workflows/wf-1/edit"] },
            )}
          />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

const canvasNodes = () =>
  screen.getByTestId("canvas-stub").getAttribute("data-nodes");

/** The unsaved edit: Mark A deleted, so the canvas holds Upload and Mark B. */
function deleteMarkAWithoutSaving() {
  const onConfigChange = capturedCanvasProps.current?.onConfigChange as
    | ((next: GraphWorkflowConfig) => void)
    | undefined;
  const config = capturedCanvasProps.current?.config as
    | GraphWorkflowConfig
    | undefined;
  if (!onConfigChange || !config) throw new Error("canvas stub not mounted");
  const { markA: _removed, ...rest } = config.nodes;
  act(() => {
    onConfigChange({
      ...config,
      nodes: rest,
      edges: config.edges.filter(
        (e) => e.source !== "markA" && e.target !== "markA",
      ),
    });
  });
}

async function restoreV1() {
  fireEvent.click(screen.getByTestId("topbar-more-button"));
  fireEvent.click(await screen.findByTestId("topbar-menu-history"));
  fireEvent.click(await screen.findByTestId("history-row-revert-v1-id"));
  const confirm = await screen.findByTestId(
    "revert-confirm-button",
    {},
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(confirm);
  });
}

/** Holds every workflow fetch until the returned function is called. */
function holdWorkflowFetches(): () => void {
  let openGate: (() => void) | undefined;
  server.gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  return () => {
    server.gate = null;
    openGate?.();
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkflowEditorV2Page — restoring a version with unsaved edits", () => {
  beforeEach(() => {
    server.head = head(2, v2Config);
    server.gate = null;
    server.revertResult = head(3, v1Config);
    server.saves = [];
    capturedCanvasProps.current = null;
    notificationsShowMock.mockReset();
  });

  it("puts the restored steps on the canvas, leaves nothing to undo, and saves them", async () => {
    renderEditor();
    await waitFor(() => expect(canvasNodes()).toBe("markA,markB,upload1"));

    deleteMarkAWithoutSaving();
    expect(canvasNodes()).toBe("markB,upload1");
    expect(screen.getByTestId("undo-button")).toBeEnabled();
    expect(screen.getByTestId("run-this-workflow-button")).toBeDisabled();

    // The restore's own refetch stays in flight until released below.
    const releaseRefetch = holdWorkflowFetches();
    await restoreV1();

    await waitFor(() => expect(canvasNodes()).toBe("markA,upload1"));
    expect(notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "green",
        title: "Restored v1 as v3",
      }),
    );
    // Nothing to undo back into, and nothing unsaved: Run is available again.
    expect(screen.getByTestId("undo-button")).toBeDisabled();
    expect(screen.getByTestId("redo-button")).toBeDisabled();
    expect(screen.getByTestId("run-this-workflow-button")).toBeEnabled();

    // The refetch lands with the same head; the canvas stays as it is.
    await act(async () => {
      releaseRefetch();
    });
    expect(canvasNodes()).toBe("markA,upload1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("save-button"));
    });
    await waitFor(() => expect(server.saves).toHaveLength(1));
    const saved = server.saves[0];
    expect(saved.id).toBe("wf-1");
    expect(saved.dto.expectedVersion).toBe(3);
    expect(Object.keys(saved.dto.config?.nodes ?? {}).sort()).toEqual([
      "markA",
      "upload1",
    ]);
    expect(
      saved.dto.config?.edges.map((e) => `${e.source}->${e.target}`),
    ).toEqual(["upload1->markA"]);
  });

  it("keeps the unsaved edits when the restore fails", async () => {
    server.revertResult = new Error("Backend exploded");
    renderEditor();
    await waitFor(() => expect(canvasNodes()).toBe("markA,markB,upload1"));

    deleteMarkAWithoutSaving();
    await restoreV1();

    await waitFor(() =>
      expect(notificationsShowMock).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red", title: "Revert failed" }),
      ),
    );
    expect(canvasNodes()).toBe("markB,upload1");
    expect(screen.getByTestId("undo-button")).toBeEnabled();
  });
});
