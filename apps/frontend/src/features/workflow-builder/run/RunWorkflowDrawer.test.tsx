/**
 * Tests for RunWorkflowDrawer.
 *
 * - Track 2 (US-071 + US-072): trigger URL + schema rows + run button.
 * - Track 3 (US-085): version `<Select>` + per-version run-spec refetch
 *   + workflowVersionId-in-body wiring.
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
});
