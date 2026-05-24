/**
 * Tests for RunWorkflowDrawer (Phase 2 Track 2 — US-071 + US-072).
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

const noop = () => undefined;

const renderDrawer = (workflowId = "wf-1") => {
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
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
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
    apiMock.get.mockResolvedValue({ success: true, data: sampleSpec });

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
    apiMock.get.mockResolvedValue({
      success: true,
      data: {
        ...sampleSpec,
        inputSchema: { type: "object", properties: {}, required: [] },
      },
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
    apiMock.get.mockResolvedValue({ success: true, data: sampleSpec });
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
    apiMock.get.mockResolvedValue({ success: true, data: sampleSpec });
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
});
