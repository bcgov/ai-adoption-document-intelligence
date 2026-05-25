/**
 * Tests for RunWorkflowDrawer.
 *
 * - Track 2 (US-071 + US-072): trigger URL + schema rows + run button.
 * - Track 3 (US-085): version `<Select>` + per-version run-spec refetch
 *   + workflowVersionId-in-body wiring.
 * - Phase 8 (US-123): up-to-two source sections — API only, Upload
 *   only, both, neither.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../../../data/services/api.service";
import {
  buildRunStateContextValue,
  RunStateTestProvider,
} from "./RunStateContext";
import { RunWorkflowDrawer } from "./RunWorkflowDrawer";

vi.mock("../../../data/services/api.service", () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: vi.fn(),
  },
}));

// US-123 — mock `useSourceUpload` so the Upload section tests can drive
// the upload-then-/runs chain without touching the global `fetch` (the
// drawer's API section uses the apiService mock above; mixing two
// transport mocks gets noisy fast).
const sourceUploadMutateAsync = vi.fn();
const sourceUploadState = { isPending: false };
vi.mock("../sources/useSourceUpload", () => ({
  useSourceUpload: () => ({
    mutateAsync: sourceUploadMutateAsync,
    isPending: sourceUploadState.isPending,
  }),
}));

interface ApiServiceMock {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

const sampleSpec = {
  triggerUrl: "http://localhost:3002/api/workflows/wf-1/runs",
  inputSchema: {
    type: "object" as const,
    properties: {
      customerId: {
        type: "string" as const,
        description: "Customer to process",
      },
      count: { type: "number" as const, default: 5 },
    },
    required: ["customerId"],
  },
  authNotes: "Include your API key in the `x-api-key` request header.",
  sampleCurl:
    'curl -X POST http://localhost:3002/api/workflows/wf-1/runs \\\n  -H \'x-api-key: YOUR_API_KEY\' \\\n  -d \'{"customerId":"","count":5}\'',
};

const olderSpec = {
  triggerUrl: "http://localhost:3002/api/workflows/wf-1/runs",
  inputSchema: {
    type: "object" as const,
    properties: {
      customerId: { type: "string" as const },
    },
    required: ["customerId"],
  },
  authNotes: "Include your API key in the `x-api-key` request header.",
  sampleCurl:
    "curl -X POST http://localhost:3002/api/workflows/wf-1/runs \\\n  -H 'x-api-key: YOUR_API_KEY' \\\n  -d '{\"customerId\":\"\"}'",
};

const versionsList = [
  { id: "wv-3", versionNumber: 3, createdAt: "2026-05-23T00:00:00.000Z" },
  { id: "wv-2", versionNumber: 2, createdAt: "2026-05-22T00:00:00.000Z" },
  { id: "wv-1", versionNumber: 1, createdAt: "2026-05-21T00:00:00.000Z" },
];

const HEAD_VERSION_ID = "wv-3";

const noop = () => undefined;

const renderDrawer = (
  workflowId = "wf-1",
  headVersionId: string | undefined = HEAD_VERSION_ID,
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <RunWorkflowDrawer
          opened={true}
          onClose={noop}
          workflowId={workflowId}
          headVersionId={headVersionId}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

/**
 * Default mock that resolves the two GETs the drawer fires on mount:
 *   - /workflows/wf-1/run-spec (head — no query param)
 *   - /workflows/wf-1/versions (the list for the Select)
 * Subsequent calls (e.g. refetch on version change) fall through to the
 * spec branch so individual tests don't have to re-mock every URL.
 */
const mockDefaultGets = (apiMock: ApiServiceMock) => {
  apiMock.get.mockImplementation((url: string) => {
    if (url === "/workflows/wf-1/versions") {
      return Promise.resolve({
        success: true,
        data: { versions: versionsList },
      });
    }
    if (url.startsWith("/workflows/wf-1/run-spec")) {
      return Promise.resolve({ success: true, data: sampleSpec });
    }
    return Promise.resolve({ success: false, message: `unhandled: ${url}` });
  });
};

describe("RunWorkflowDrawer", () => {
  let apiMock: ApiServiceMock;

  beforeEach(() => {
    apiMock = apiService as unknown as ApiServiceMock;
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    sourceUploadMutateAsync.mockReset();
    sourceUploadState.isPending = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the run-spec and renders the trigger URL + schema rows", async () => {
    mockDefaultGets(apiMock);

    renderDrawer();

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/workflows/wf-1/run-spec");
    });

    await screen.findByText(sampleSpec.triggerUrl);
    expect(
      screen.getByRole("button", { name: /Copy trigger URL/i }),
    ).toBeInTheDocument();
    // Schema rows: customerId + count
    expect(screen.getByText("customerId")).toBeInTheDocument();
    expect(screen.getByText("count")).toBeInTheDocument();
    expect(screen.getByText("Customer to process")).toBeInTheDocument();
    // Required badge for customerId
    expect(screen.getByText("required")).toBeInTheDocument();
    // Sample curl present (just confirm the section + button render)
    expect(screen.getByText("Sample curl")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy curl/i }),
    ).toBeInTheDocument();
    // Auth notes present
    expect(screen.getByText(sampleSpec.authNotes)).toBeInTheDocument();
  });

  it("shows an empty-state message when the schema has no properties", async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === "/workflows/wf-1/versions") {
        return Promise.resolve({
          success: true,
          data: { versions: versionsList },
        });
      }
      if (url.startsWith("/workflows/wf-1/run-spec")) {
        return Promise.resolve({
          success: true,
          data: {
            ...sampleSpec,
            inputSchema: { type: "object", properties: {}, required: [] },
          },
        });
      }
      return Promise.resolve({ success: false, message: `unhandled: ${url}` });
    });

    renderDrawer();

    await screen.findByText(/No inputs declared/);
    expect(
      screen.getByText(
        /Mark ctx entries as "Input" in Workflow settings to expose them here/,
      ),
    ).toBeInTheDocument();
  });

  it("starts a workflow run on Run click and shows the workflowId", async () => {
    mockDefaultGets(apiMock);
    apiMock.post.mockResolvedValue({
      success: true,
      data: {
        workflowId: "graph-adhoc-abc-123",
        workflowVersionId: "wv-1",
        status: "started",
      },
    });

    renderDrawer();

    const runBtn = await screen.findByTestId("run-workflow-button");
    expect(runBtn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        "/workflows/wf-1/runs",
        expect.objectContaining({
          initialCtx: expect.objectContaining({ customerId: "", count: 5 }),
        }),
      );
    });

    expect(await screen.findByText("graph-adhoc-abc-123")).toBeInTheDocument();
  });

  it("surfaces a backend 400 message as a red Alert", async () => {
    mockDefaultGets(apiMock);
    apiMock.post.mockResolvedValue({
      success: false,
      message: 'Missing required field "customerId"',
      data: null,
    });

    renderDrawer();

    const runBtn = await screen.findByTestId("run-workflow-button");
    await act(async () => {
      fireEvent.click(runBtn);
    });

    expect(
      await screen.findByText(/Missing required field "customerId"/),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // US-085 — version selector wires per-version run-spec + run body
  // ---------------------------------------------------------------------

  it("Scenario 1: defaults the version Select to the head version with a 'head' suffix", async () => {
    mockDefaultGets(apiMock);

    renderDrawer();

    // Wait for the versions list + run-spec to resolve so the Select
    // populates.
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/workflows/wf-1/versions");
    });
    await screen.findByText(sampleSpec.triggerUrl);

    const select = await screen.findByTestId("run-workflow-version-select");
    // Mantine's <Select> exposes the currently-selected label as the
    // `value` of the underlying input.
    const input = select as HTMLInputElement;
    expect(input.value).toBe("v3 — head");
  });

  it("Scenario 2: changing the version refetches the spec with ?workflowVersionId=", async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === "/workflows/wf-1/versions") {
        return Promise.resolve({
          success: true,
          data: { versions: versionsList },
        });
      }
      if (url === "/workflows/wf-1/run-spec") {
        return Promise.resolve({ success: true, data: sampleSpec });
      }
      if (url.startsWith("/workflows/wf-1/run-spec?workflowVersionId=")) {
        return Promise.resolve({ success: true, data: olderSpec });
      }
      return Promise.resolve({ success: false, message: `unhandled: ${url}` });
    });

    renderDrawer();

    // Initial head fetch — no workflowVersionId query param.
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/workflows/wf-1/run-spec");
    });

    // Wait for the Select to be populated (versions loaded → not disabled).
    const select = (await screen.findByTestId(
      "run-workflow-version-select",
    )) as HTMLInputElement;
    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });

    // Mantine's Combobox renders its options into a portal that's hidden
    // (display:none) until a real mouse interaction opens it; jsdom can't
    // reproduce that pointer dance reliably inside a focus-trapped
    // <Drawer>. The options ARE in the DOM though, so we use
    // `hidden: true` to bypass the visibility check and click directly.
    await act(async () => {
      fireEvent.click(select);
    });
    const option = await screen.findByRole(
      "option",
      { name: "v2", hidden: true },
      { timeout: 1000 },
    );
    await act(async () => {
      fireEvent.click(option);
    });

    // The hook re-runs with the new workflowVersionId in the URL.
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith(
        "/workflows/wf-1/run-spec?workflowVersionId=wv-2",
      );
    });
  });

  it("Scenario 3: Run sends workflowVersionId in the body when a non-head version is selected", async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === "/workflows/wf-1/versions") {
        return Promise.resolve({
          success: true,
          data: { versions: versionsList },
        });
      }
      if (url === "/workflows/wf-1/run-spec") {
        return Promise.resolve({ success: true, data: sampleSpec });
      }
      if (url.startsWith("/workflows/wf-1/run-spec?workflowVersionId=")) {
        return Promise.resolve({ success: true, data: olderSpec });
      }
      return Promise.resolve({ success: false, message: `unhandled: ${url}` });
    });
    apiMock.post.mockResolvedValue({
      success: true,
      data: {
        workflowId: "graph-adhoc-xyz-999",
        workflowVersionId: "wv-2",
        status: "started",
      },
    });

    renderDrawer();

    // Wait for the Select to be populated (versions loaded → not disabled).
    const select = (await screen.findByTestId(
      "run-workflow-version-select",
    )) as HTMLInputElement;
    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });

    // Switch to v2 (see Scenario 2 — `hidden: true` needed inside Drawer).
    await act(async () => {
      fireEvent.click(select);
    });
    const option = await screen.findByRole(
      "option",
      { name: "v2", hidden: true },
      { timeout: 1000 },
    );
    await act(async () => {
      fireEvent.click(option);
    });
    // Wait for the v2 refetch to land so the prefilled JSON is in sync.
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith(
        "/workflows/wf-1/run-spec?workflowVersionId=wv-2",
      );
    });

    const runBtn = await screen.findByTestId("run-workflow-button");
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        "/workflows/wf-1/runs",
        expect.objectContaining({
          initialCtx: expect.any(Object),
          workflowVersionId: "wv-2",
        }),
      );
    });
  });

  it("Scenario 4: Run omits workflowVersionId when head is selected", async () => {
    mockDefaultGets(apiMock);
    apiMock.post.mockResolvedValue({
      success: true,
      data: {
        workflowId: "graph-adhoc-head-111",
        workflowVersionId: HEAD_VERSION_ID,
        status: "started",
      },
    });

    renderDrawer();

    const runBtn = await screen.findByTestId("run-workflow-button");
    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledTimes(1);
    });
    const [, body] = apiMock.post.mock.calls[0];
    expect(body).not.toHaveProperty("workflowVersionId");
    expect(body).toEqual(
      expect.objectContaining({
        initialCtx: expect.any(Object),
      }),
    );
  });

  // ---------------------------------------------------------------------
  // US-123 — up-to-two source sections (Phase 8)
  //
  // Each `describe` block fixes one of the four /run-spec shapes from
  // DOCUMENT_SOURCES_DESIGN.md §7.4 and asserts which sections render.
  // ---------------------------------------------------------------------

  const uploadSpec = {
    sourceNodeId: "src-upload-1",
    uploadUrl:
      "http://localhost:3002/api/workflows/wf-1/sources/src-upload-1/upload",
    allowedMimeTypes: ["application/pdf", "image/png"],
    maxFileSizeMB: 25,
    ctxKey: "documentUrl",
  };

  const mockRunSpec = (apiMock: ApiServiceMock, runSpec: unknown) => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === "/workflows/wf-1/versions") {
        return Promise.resolve({
          success: true,
          data: { versions: versionsList },
        });
      }
      if (url.startsWith("/workflows/wf-1/run-spec")) {
        return Promise.resolve({ success: true, data: runSpec });
      }
      return Promise.resolve({ success: false, message: `unhandled: ${url}` });
    });
  };

  it("US-123 Scenario 1: source.api only (uploadSpec absent) → API section renders, Upload section absent", async () => {
    mockRunSpec(apiMock, sampleSpec);

    renderDrawer();

    await screen.findByTestId("run-drawer-api-section");
    expect(screen.queryByTestId("run-drawer-upload-section")).toBeNull();
    // API surface fingerprints — JsonInput + Run button live here.
    expect(screen.getByTestId("run-workflow-button")).toBeInTheDocument();
    expect(screen.getByText(sampleSpec.triggerUrl)).toBeInTheDocument();
    expect(
      screen.queryByTestId("run-drawer-upload-dropzone"),
    ).not.toBeInTheDocument();
  });

  it("US-123 Scenario 2: source.upload only (empty inputSchema + uploadSpec) → Upload section renders, JsonInput absent + upload-then-run chain fires", async () => {
    mockRunSpec(apiMock, {
      ...sampleSpec,
      inputSchema: { type: "object", properties: {}, required: [] },
      uploadSpec,
    });
    sourceUploadMutateAsync.mockResolvedValue({
      documentUrl: "https://blob.example/abc-123",
    });
    apiMock.post.mockResolvedValue({
      success: true,
      data: {
        workflowId: "graph-upload-only-001",
        workflowVersionId: HEAD_VERSION_ID,
        status: "started",
      },
    });

    renderDrawer();

    await screen.findByTestId("run-drawer-upload-section");
    // The API section is hidden — inputSchema has no fields AND
    // uploadSpec is present.
    expect(screen.queryByTestId("run-drawer-api-section")).toBeNull();
    expect(screen.queryByTestId("run-workflow-button")).not.toBeInTheDocument();

    // Run button is disabled until a file is dropped.
    const runBtn = screen.getByTestId("run-drawer-upload-run-button");
    expect(runBtn).toBeDisabled();

    // Drop a file into the Dropzone. Mantine's Dropzone composes an
    // internal `<input type="file">` that fires the same `onDrop`
    // callback under the hood.
    const file = new File(["pdf bytes"], "doc.pdf", {
      type: "application/pdf",
    });
    const fileInput = document
      .querySelector('[data-testid="run-drawer-upload-dropzone"]')
      ?.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    if (fileInput) {
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });
    }

    await waitFor(() => {
      expect(
        screen.getByTestId("run-drawer-upload-run-button"),
      ).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("run-drawer-upload-run-button"));
    });

    await waitFor(() => {
      expect(sourceUploadMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(sourceUploadMutateAsync).toHaveBeenCalledWith(file);

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        "/workflows/wf-1/runs",
        expect.objectContaining({
          initialCtx: { documentUrl: "https://blob.example/abc-123" },
        }),
      );
    });

    expect(
      await screen.findByTestId("run-drawer-upload-success"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("graph-upload-only-001"),
    ).toBeInTheDocument();
  });

  it("US-123 Scenario 3: BOTH source.api + source.upload → both sections render", async () => {
    mockRunSpec(apiMock, { ...sampleSpec, uploadSpec });

    renderDrawer();

    await screen.findByTestId("run-drawer-api-section");
    expect(screen.getByTestId("run-drawer-upload-section")).toBeInTheDocument();
    // Both Run buttons coexist — each drives its own chain.
    expect(screen.getByTestId("run-workflow-button")).toBeInTheDocument();
    expect(
      screen.getByTestId("run-drawer-upload-run-button"),
    ).toBeInTheDocument();
    // API surface still surfaces the trigger URL + sample curl.
    expect(screen.getByText(sampleSpec.triggerUrl)).toBeInTheDocument();
  });

  it("US-123 Scenario 4: legacy isInput workflow (neither source node) → API section unchanged, Upload section absent", async () => {
    // The drawer can't tell whether `inputSchema` came from a
    // source.api or from an isInput-derived ctx — its only signal is
    // `uploadSpec` presence. Omitting `uploadSpec` reproduces the
    // legacy Phase 2 Track 2 shape exactly.
    mockRunSpec(apiMock, sampleSpec);
    apiMock.post.mockResolvedValue({
      success: true,
      data: {
        workflowId: "graph-legacy-isInput-222",
        workflowVersionId: HEAD_VERSION_ID,
        status: "started",
      },
    });

    renderDrawer();

    // API section renders with the exact Phase 2 Track 2 surface —
    // trigger URL, schema rows, sample curl, JsonInput, Run button.
    await screen.findByTestId("run-drawer-api-section");
    expect(screen.queryByTestId("run-drawer-upload-section")).toBeNull();
    expect(screen.getByText(sampleSpec.triggerUrl)).toBeInTheDocument();
    expect(screen.getByText("customerId")).toBeInTheDocument();
    expect(screen.getByText("count")).toBeInTheDocument();

    // The Run button still drives /runs directly with the parsed JSON
    // body — exactly as Phase 2 Track 2 left it.
    const runBtn = await screen.findByTestId("run-workflow-button");
    await act(async () => {
      fireEvent.click(runBtn);
    });
    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        "/workflows/wf-1/runs",
        expect.objectContaining({
          initialCtx: expect.objectContaining({ customerId: "", count: 5 }),
        }),
      );
    });
    expect(
      await screen.findByTestId("run-drawer-api-success"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("graph-legacy-isInput-222"),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // US-149 — Two-tab layout (Try / Run)
  //
  // - `openMode="try"` / `openMode="run"` pre-select the matching tab.
  // - Try tab submits with canvas-iteration semantics: closes the
  //   drawer + sets `activeRunId` BEFORE the close so the canvas's
  //   polling loop catches the new run id (US-138).
  // - Run tab keeps its Phase 2 Track 2 behaviour: paste body → click
  //   Run → drawer stays open + inline workflowId Alert.
  // - Try-submit failure keeps the drawer open with a red Alert.
  // ---------------------------------------------------------------------

  describe("US-149: Try / Run tabs", () => {
    const renderDrawerWithRunState = (
      props: {
        workflowId?: string;
        headVersionId?: string;
        openMode?: "try" | "run";
        onClose?: () => void;
        setActiveRunId?: (id: string | null) => void;
      } = {},
    ) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      const setActiveRunId = props.setActiveRunId ?? vi.fn();
      const onClose = props.onClose ?? vi.fn();
      const value = buildRunStateContextValue({
        workflowId: props.workflowId ?? "wf-1",
        setActiveRunId,
      });
      const utils = render(
        <QueryClientProvider client={queryClient}>
          <MantineProvider>
            <RunStateTestProvider value={value}>
              <RunWorkflowDrawer
                opened={true}
                onClose={onClose}
                workflowId={props.workflowId ?? "wf-1"}
                headVersionId={props.headVersionId ?? HEAD_VERSION_ID}
                openMode={props.openMode}
              />
            </RunStateTestProvider>
          </MantineProvider>
        </QueryClientProvider>,
      );
      return { ...utils, setActiveRunId, onClose };
    };

    it("Scenario 1: openMode='try' pre-selects the Try tab", async () => {
      mockDefaultGets(apiMock);

      renderDrawerWithRunState({ openMode: "try" });

      // Try section is the visible panel; the Run tab's API panel
      // (with the trigger URL) is not mounted (`keepMounted={false}`).
      await screen.findByTestId("run-drawer-try-section");
      expect(
        screen.queryByTestId("run-drawer-api-section"),
      ).not.toBeInTheDocument();
      // Both tab triggers exist either way — the test pins which panel is
      // active, not which tab buttons exist.
      expect(screen.getByTestId("run-drawer-tab-try")).toBeInTheDocument();
      expect(screen.getByTestId("run-drawer-tab-run")).toBeInTheDocument();
    });

    it("Scenario 1: openMode='run' pre-selects the Run tab", async () => {
      mockDefaultGets(apiMock);

      renderDrawerWithRunState({ openMode: "run" });

      // Run section (Phase 2 Track 2 surface) is the visible panel.
      await screen.findByTestId("run-drawer-api-section");
      expect(
        screen.queryByTestId("run-drawer-try-section"),
      ).not.toBeInTheDocument();
      // The Phase 2 Track 2 trigger URL still renders inside the Run
      // panel — proves the existing content moved into the panel verbatim.
      expect(screen.getByText(sampleSpec.triggerUrl)).toBeInTheDocument();
    });

    it("Scenario 2 + 5: Try submit POSTs /runs, sets activeRunId BEFORE onClose, and closes the drawer", async () => {
      mockDefaultGets(apiMock);
      apiMock.post.mockResolvedValue({
        success: true,
        data: {
          workflowId: "graph-try-success-1",
          workflowVersionId: HEAD_VERSION_ID,
          status: "started",
        },
      });
      // Track ordering: `setActiveRunId` MUST fire before `onClose` so
      // the canvas's polling loops latch on before the drawer unmounts.
      const callOrder: string[] = [];
      const setActiveRunId = vi.fn((id: string | null) => {
        callOrder.push(`setActiveRunId:${String(id)}`);
      });
      const onClose = vi.fn(() => {
        callOrder.push("onClose");
      });

      renderDrawerWithRunState({
        openMode: "try",
        setActiveRunId,
        onClose,
      });

      const tryBtn = await screen.findByTestId("try-workflow-button");
      await act(async () => {
        fireEvent.click(tryBtn);
      });

      await waitFor(() => {
        expect(apiMock.post).toHaveBeenCalledWith(
          "/workflows/wf-1/runs",
          expect.objectContaining({
            initialCtx: expect.objectContaining({ customerId: "", count: 5 }),
          }),
        );
      });
      await waitFor(() => {
        expect(setActiveRunId).toHaveBeenCalledWith("graph-try-success-1");
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual([
        "setActiveRunId:graph-try-success-1",
        "onClose",
      ]);
      // No inline workflowId Alert on the Try tab — the canvas is the
      // result surface.
      expect(
        screen.queryByTestId("run-drawer-api-success"),
      ).not.toBeInTheDocument();
    });

    it("Scenario 3: Run tab submit keeps the drawer open + shows inline workflowId + does NOT set activeRunId", async () => {
      mockDefaultGets(apiMock);
      apiMock.post.mockResolvedValue({
        success: true,
        data: {
          workflowId: "graph-run-tab-keep-open-1",
          workflowVersionId: HEAD_VERSION_ID,
          status: "started",
        },
      });
      const setActiveRunId = vi.fn();
      const onClose = vi.fn();

      renderDrawerWithRunState({
        openMode: "run",
        setActiveRunId,
        onClose,
      });

      const runBtn = await screen.findByTestId("run-workflow-button");
      await act(async () => {
        fireEvent.click(runBtn);
      });

      // Phase 2 Track 2 behaviour: inline workflowId Alert + drawer
      // stays open. `setActiveRunId` is NEVER called from the Run tab.
      expect(
        await screen.findByTestId("run-drawer-api-success"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("graph-run-tab-keep-open-1"),
      ).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(setActiveRunId).not.toHaveBeenCalled();
    });

    it("Scenario 5: Try submit failure keeps drawer open with red Alert + does NOT set activeRunId", async () => {
      mockDefaultGets(apiMock);
      apiMock.post.mockResolvedValue({
        success: false,
        message: "Backend exploded",
        data: null,
      });
      const setActiveRunId = vi.fn();
      const onClose = vi.fn();

      renderDrawerWithRunState({
        openMode: "try",
        setActiveRunId,
        onClose,
      });

      const tryBtn = await screen.findByTestId("try-workflow-button");
      await act(async () => {
        fireEvent.click(tryBtn);
      });

      expect(
        await screen.findByTestId("run-drawer-try-error"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Backend exploded")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(setActiveRunId).not.toHaveBeenCalled();
    });

    it("Scenario 4: BOTH source.api + source.upload → Tabs render above an Upload section that keeps its Run semantics", async () => {
      mockRunSpec(apiMock, { ...sampleSpec, uploadSpec });

      renderDrawerWithRunState({ openMode: "try" });

      // Tabs sit at the top, the Upload section sits below them — both
      // co-exist. Try tab is active so the Try section renders.
      await screen.findByTestId("run-drawer-tabs");
      expect(screen.getByTestId("run-drawer-try-section")).toBeInTheDocument();
      expect(
        screen.getByTestId("run-drawer-upload-section"),
      ).toBeInTheDocument();
      // The Upload section's Run button (Phase 8 chain — drop → upload
      // → /runs → inline workflowId) is unchanged.
      expect(
        screen.getByTestId("run-drawer-upload-run-button"),
      ).toBeInTheDocument();
    });
  });
});
