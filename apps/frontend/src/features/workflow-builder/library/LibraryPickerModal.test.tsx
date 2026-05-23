/**
 * Tests for `LibraryPickerModal` (US-062).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260526-workflow-builder-phase2-library-workflows/user_stories/US-062-library-picker-modal.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowInfo } from "../../../data/hooks/useWorkflows";
import type { GraphMetadata } from "../../../types/workflow";
import { LibraryPickerModal } from "./LibraryPickerModal";

const apiGetMock = vi.fn();

vi.mock("../../../auth/GroupContext", () => ({
  useGroup: () => ({ activeGroup: { id: "group-1", name: "Group 1" } }),
}));

vi.mock("../../../data/services/api.service", () => ({
  apiService: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}));

function makeLibrary(
  id: string,
  name: string,
  metadata: GraphMetadata = {},
): WorkflowInfo {
  return {
    id,
    workflowVersionId: `${id}-v1`,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    description: `${name} description`,
    actorId: "actor-1",
    config: {
      schemaVersion: "1.0",
      metadata,
      entryNodeId: "",
      nodes: {},
      edges: [],
      ctx: {},
    },
    schemaVersion: "1.0",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function renderPicker(
  overrides?: Partial<React.ComponentProps<typeof LibraryPickerModal>>,
) {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const props = {
    opened: true,
    onClose,
    onSelect,
    ...overrides,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <LibraryPickerModal {...props} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onClose, onSelect };
}

describe("LibraryPickerModal — Scenario 1 (US-062): fetches libraries on open", () => {
  it("requests /workflows?kind=library on open and renders a library card per workflow", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: {
        workflows: [
          makeLibrary("lib-1", "Invoice extractor", {
            inputs: [{ label: "URL", path: "ctx.documentUrl", type: "string" }],
            outputs: [{ label: "Fields", path: "ctx.fields", type: "object" }],
          }),
        ],
      },
    });

    renderPicker();

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalled();
    });
    const requestedUrl = apiGetMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("kind=library");

    await waitFor(() => {
      expect(
        screen.getByTestId("library-picker-card-lib-1"),
      ).toBeInTheDocument();
    });
  });
});

describe("LibraryPickerModal — Scenario 4 (US-062): empty state when no libraries exist", () => {
  it("shows a helpful 'no libraries yet' message when the response is empty", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [] },
    });

    renderPicker();

    await waitFor(() => {
      expect(screen.getByText(/No libraries yet/i)).toBeInTheDocument();
    });
  });
});

describe("LibraryPickerModal — Scenario 3 (US-062): selecting a row invokes onSelect", () => {
  it("clicking a library card invokes onSelect with the chosen workflow", async () => {
    const picked = makeLibrary("lib-2", "Approval flow", {
      inputs: [],
      outputs: [],
    });
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [picked] },
    });

    const { onSelect } = renderPicker();

    const card = await screen.findByTestId("library-picker-card-lib-2");
    card.click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(picked);
  });
});

describe("LibraryPickerModal — Scenario 5 (US-062): error state surfaces", () => {
  it("shows a 'Failed to load libraries' message with a Retry button when the fetch fails", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: false,
      message: "boom",
    });

    renderPicker();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load libraries/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});
