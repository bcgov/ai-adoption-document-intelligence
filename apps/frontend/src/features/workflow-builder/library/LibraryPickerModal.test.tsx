/**
 * Tests for `LibraryPickerModal`.
 *
 * Original scenarios from US-062 (fetch on open, empty state, error
 * state, confirm-on-select) plus the US-086 scenarios that add a
 * "Version" `<Select>` and change the confirm callback to return
 * `{ workflowId, version? }`.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkflowInfo,
  WorkflowVersionSummary,
} from "../../../data/hooks/useWorkflows";
import type { GraphMetadata } from "../../../types/workflow";
import { LibraryPickerModal } from "./LibraryPickerModal";

// ---------------------------------------------------------------------------
// Module mocks: stub the data layer so tests focus on the modal contract.
// ---------------------------------------------------------------------------

const apiGetMock = vi.fn();

vi.mock("../../../auth/GroupContext", () => ({
  useGroup: () => ({ activeGroup: { id: "group-1", name: "Group 1" } }),
}));

vi.mock("../../../data/services/api.service", () => ({
  apiService: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}));

// `useWorkflowVersions` is mocked separately from the HTTP layer so the
// US-086 scenarios can drive the loading / loaded states deterministically
// without juggling `apiGetMock` order with the existing libraries-list
// fetch.
type UseWorkflowVersionsReturn = {
  data: WorkflowVersionSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

const useWorkflowVersionsMock =
  vi.fn<(lineageId: string | undefined) => UseWorkflowVersionsReturn>();

vi.mock("../../../data/hooks/useWorkflows", async () => {
  const actual = await vi.importActual<
    typeof import("../../../data/hooks/useWorkflows")
  >("../../../data/hooks/useWorkflows");
  return {
    ...actual,
    useWorkflowVersions: (lineageId: string | undefined) =>
      useWorkflowVersionsMock(lineageId),
  };
});

function setVersionsState(state: Partial<UseWorkflowVersionsReturn>): void {
  useWorkflowVersionsMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...state,
  });
}

// ---------------------------------------------------------------------------
// Fixtures + render helper
// ---------------------------------------------------------------------------

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

beforeEach(() => {
  // Default: no library row selected → hook is invoked with undefined and
  // returns an empty idle state. Individual tests can override via
  // `setVersionsState(...)`.
  setVersionsState({ data: [] });
});

afterEach(() => {
  apiGetMock.mockReset();
  useWorkflowVersionsMock.mockReset();
});

// ---------------------------------------------------------------------------
// US-062 — original scenarios (updated for the new confirm-button flow)
// ---------------------------------------------------------------------------

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

describe("LibraryPickerModal — Scenario 3 (US-062): selecting a row + confirm invokes onSelect", () => {
  it("clicking a library card highlights it, and Confirm invokes onSelect with the chosen workflowId", async () => {
    const picked = makeLibrary("lib-2", "Approval flow", {
      inputs: [],
      outputs: [],
    });
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [picked] },
    });
    setVersionsState({ data: [] });

    const { onSelect } = renderPicker();

    const card = await screen.findByTestId("library-picker-card-lib-2");
    fireEvent.click(card);

    // Click does NOT immediately call onSelect — the user must confirm.
    expect(onSelect).not.toHaveBeenCalled();

    const confirm = screen.getByTestId("library-picker-confirm");
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({ workflowId: "lib-2" });
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

// ---------------------------------------------------------------------------
// US-086 — Version Select scenarios
// ---------------------------------------------------------------------------

const libVersions: WorkflowVersionSummary[] = [
  { id: "v3-id", versionNumber: 3, createdAt: "2026-05-22T18:00:00.000Z" },
  { id: "v2-id", versionNumber: 2, createdAt: "2026-05-21T18:00:00.000Z" },
  { id: "v1-id", versionNumber: 1, createdAt: "2026-05-20T18:00:00.000Z" },
];

describe("LibraryPickerModal — US-086 Scenario 1: Version Select appears after a library is selected", () => {
  it("renders the Version Select with [head, v3, v2, v1] options and defaults to 'head'", async () => {
    const lib = makeLibrary("lib-1", "Pinned lib");
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [lib] },
    });
    setVersionsState({ data: libVersions });

    renderPicker();

    const card = await screen.findByTestId("library-picker-card-lib-1");

    // Before selection: no Version Select rendered.
    expect(
      screen.queryByTestId("library-picker-version-select"),
    ).not.toBeInTheDocument();

    fireEvent.click(card);

    const select = await screen.findByTestId("library-picker-version-select");
    // Mantine's Select uses a hidden input for the current value.
    const hiddenInput = select as HTMLInputElement;
    expect(hiddenInput.value).toBe("head");

    // Expand the dropdown and assert the option list mirrors
    // [head, v{versionNumber}, ...].
    fireEvent.click(hiddenInput);
    await waitFor(() => {
      expect(screen.getByText("head")).toBeInTheDocument();
    });
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });
});

describe("LibraryPickerModal — US-086 Scenario 2: loading state for the version fetch", () => {
  it("disables the Select and shows a small Loader next to it while versions are fetching", async () => {
    const lib = makeLibrary("lib-1", "Pinned lib");
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [lib] },
    });
    setVersionsState({ data: undefined, isLoading: true });

    renderPicker();

    const card = await screen.findByTestId("library-picker-card-lib-1");
    fireEvent.click(card);

    const select = (await screen.findByTestId(
      "library-picker-version-select",
    )) as HTMLInputElement;
    expect(select).toBeDisabled();
    expect(
      screen.getByTestId("library-picker-version-loader"),
    ).toBeInTheDocument();
  });
});

describe("LibraryPickerModal — US-086 Scenario 3: Confirm returns the right shape", () => {
  it("returns { workflowId, version: N } when a non-head version is picked", async () => {
    const lib = makeLibrary("lib-1", "Pinned lib");
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [lib] },
    });
    setVersionsState({ data: libVersions });

    const { onSelect } = renderPicker();

    fireEvent.click(await screen.findByTestId("library-picker-card-lib-1"));

    const select = (await screen.findByTestId(
      "library-picker-version-select",
    )) as HTMLInputElement;
    // Open the dropdown and pick v3.
    fireEvent.click(select);
    fireEvent.click(await screen.findByText("v3"));

    fireEvent.click(screen.getByTestId("library-picker-confirm"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({
      workflowId: "lib-1",
      version: 3,
    });
  });

  it("returns { workflowId } with NO version key when 'head' is left selected", async () => {
    const lib = makeLibrary("lib-1", "Pinned lib");
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [lib] },
    });
    setVersionsState({ data: libVersions });

    const { onSelect } = renderPicker();

    fireEvent.click(await screen.findByTestId("library-picker-card-lib-1"));

    // Don't touch the select — defaults to 'head'.
    fireEvent.click(screen.getByTestId("library-picker-confirm"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toEqual({ workflowId: "lib-1" });
    expect(arg).not.toHaveProperty("version");
  });
});

describe("LibraryPickerModal — US-086 Scenario 4: Confirm disabled until a library is selected", () => {
  it("Confirm is disabled and the Version Select is not rendered when nothing is selected", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: {
        workflows: [makeLibrary("lib-1", "Pinned lib")],
      },
    });
    setVersionsState({ data: [] });

    renderPicker();

    // Wait for the library list to render so we know the modal is settled.
    await screen.findByTestId("library-picker-card-lib-1");

    expect(screen.getByTestId("library-picker-confirm")).toBeDisabled();
    expect(
      screen.queryByTestId("library-picker-version-select"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-087 — pre-seed flow (initialWorkflowId + initialVersion props)
// ---------------------------------------------------------------------------

describe("LibraryPickerModal — US-087: initialWorkflowId + initialVersion pre-seed the picker", () => {
  it("pre-highlights the library row matching initialWorkflowId and sets the Version Select to the matching initialVersion", async () => {
    const lib = makeLibrary("lib-1", "Pinned lib");
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [lib] },
    });
    setVersionsState({ data: libVersions });

    const { onSelect } = renderPicker({
      initialWorkflowId: "lib-1",
      initialVersion: 2,
    });

    // The pre-seeded library row should be selected (no manual click needed).
    const card = await screen.findByTestId("library-picker-card-lib-1");
    await waitFor(() => {
      expect(card.getAttribute("data-selected")).toBe("true");
    });

    // The Version Select should auto-populate with the matching v2 option
    // once the versions list resolves. The Mantine Select renders the
    // selected option's label in its searchable input — so we assert on the
    // displayed label `"v2"` (the internal `value` is the version's id).
    const select = (await screen.findByTestId(
      "library-picker-version-select",
    )) as HTMLInputElement;
    await waitFor(() => {
      expect(select.value).toBe("v2");
    });

    // Confirm should yield the pre-seeded version (idempotent re-pin).
    fireEvent.click(screen.getByTestId("library-picker-confirm"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({
      workflowId: "lib-1",
      version: 2,
    });
  });

  it("pre-highlights the library row but leaves Version Select at 'head' when initialVersion is undefined", async () => {
    const lib = makeLibrary("lib-1", "Pinned lib");
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: { workflows: [lib] },
    });
    setVersionsState({ data: libVersions });

    renderPicker({
      initialWorkflowId: "lib-1",
    });

    const card = await screen.findByTestId("library-picker-card-lib-1");
    await waitFor(() => {
      expect(card.getAttribute("data-selected")).toBe("true");
    });

    const select = (await screen.findByTestId(
      "library-picker-version-select",
    )) as HTMLInputElement;
    // Without an initialVersion, the Select must stay on "head".
    expect(select.value).toBe("head");
  });
});

// ---------------------------------------------------------------------------
// US-100 — kind annotations + Compatible / Other libraries grouping
// ---------------------------------------------------------------------------

describe("LibraryPickerModal — US-100 Scenario 1: signature preview surfaces kind", () => {
  it("renders the kind in the parenthesised segment when port.kind is defined", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: {
        workflows: [
          makeLibrary("lib-1", "Doc summariser", {
            inputs: [
              {
                label: "Doc",
                path: "ctx.docUrl",
                type: "string",
                kind: "Document",
              },
            ],
            outputs: [
              {
                label: "Classification",
                path: "ctx.classification",
                type: "object",
                kind: "Classification",
              },
            ],
          }),
        ],
      },
    });

    renderPicker();

    const card = await screen.findByTestId("library-picker-card-lib-1");
    expect(card.textContent ?? "").toContain("Doc (string, Document)");
    expect(card.textContent ?? "").toContain(
      "Classification (object, Classification)",
    );
  });

  it("omits the kind segment cleanly when port.kind is undefined (Scenario 3 fall-back)", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: {
        workflows: [
          makeLibrary("lib-legacy", "Legacy lib", {
            inputs: [{ label: "URL", path: "ctx.documentUrl", type: "string" }],
            outputs: [{ label: "Fields", path: "ctx.fields", type: "object" }],
          }),
        ],
      },
    });

    renderPicker();

    const card = await screen.findByTestId("library-picker-card-lib-legacy");
    expect(card.textContent ?? "").toContain("URL (string)");
    expect(card.textContent ?? "").toContain("Fields (object)");
    // Crucially: NO trailing kind segment for these undefined-kind ports.
    expect(card.textContent ?? "").not.toMatch(/URL \(string,/);
    expect(card.textContent ?? "").not.toMatch(/Fields \(object,/);
  });
});

describe("LibraryPickerModal — US-100 Scenario 4: filter to 'Compatible' / 'Other libraries' by upstream producer kind", () => {
  it("when expectedFirstInputKind is provided, compatible libraries appear above the divider and others below (dimmed)", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: {
        workflows: [
          makeLibrary("lib-doc", "Document tagger", {
            inputs: [
              {
                label: "Doc",
                path: "ctx.doc",
                type: "string",
                kind: "Document",
              },
            ],
            outputs: [],
          }),
          makeLibrary("lib-seg", "Segment classifier", {
            inputs: [
              {
                label: "Seg",
                path: "ctx.seg",
                type: "string",
                kind: "Segment",
              },
            ],
            outputs: [],
          }),
          makeLibrary("lib-legacy", "Legacy lib (untyped)", {
            inputs: [{ label: "Anything", path: "ctx.any", type: "string" }],
            outputs: [],
          }),
        ],
      },
    });

    renderPicker({ expectedFirstInputKind: "Document" });

    // The Document-typed library is "Compatible" — not dimmed.
    const compatibleCard = await screen.findByTestId(
      "library-picker-card-lib-doc",
    );
    expect(compatibleCard.getAttribute("data-dimmed")).toBe("false");

    // The Segment-typed library is incompatible — dimmed.
    const incompatibleCard = await screen.findByTestId(
      "library-picker-card-lib-seg",
    );
    expect(incompatibleCard.getAttribute("data-dimmed")).toBe("true");

    // Legacy (no kind on first input) — surfaced honestly as "Other".
    const legacyCard = await screen.findByTestId(
      "library-picker-card-lib-legacy",
    );
    expect(legacyCard.getAttribute("data-dimmed")).toBe("true");

    // The "Other libraries" divider is rendered between the two buckets.
    const divider = await screen.findByTestId("library-picker-other-divider");
    expect(divider).toBeInTheDocument();
    expect(divider.textContent ?? "").toContain("Other libraries");

    // Clicking an "Other" library still works (no hard reject) — confirm
    // selection state flips on click.
    fireEvent.click(incompatibleCard);
    await waitFor(() => {
      expect(incompatibleCard.getAttribute("data-selected")).toBe("true");
    });
    expect(screen.getByTestId("library-picker-confirm")).not.toBeDisabled();
  });

  it("when expectedFirstInputKind is omitted, the picker renders un-grouped (no divider)", async () => {
    apiGetMock.mockResolvedValueOnce({
      success: true,
      data: {
        workflows: [
          makeLibrary("lib-1", "Lib 1", {
            inputs: [
              {
                label: "Doc",
                path: "ctx.doc",
                type: "string",
                kind: "Document",
              },
            ],
            outputs: [],
          }),
          makeLibrary("lib-2", "Lib 2", {
            inputs: [
              {
                label: "Seg",
                path: "ctx.seg",
                type: "string",
                kind: "Segment",
              },
            ],
            outputs: [],
          }),
        ],
      },
    });

    renderPicker();

    const card1 = await screen.findByTestId("library-picker-card-lib-1");
    const card2 = await screen.findByTestId("library-picker-card-lib-2");
    expect(card1.getAttribute("data-dimmed")).toBe("false");
    expect(card2.getAttribute("data-dimmed")).toBe("false");
    expect(
      screen.queryByTestId("library-picker-other-divider"),
    ).not.toBeInTheDocument();
  });
});
