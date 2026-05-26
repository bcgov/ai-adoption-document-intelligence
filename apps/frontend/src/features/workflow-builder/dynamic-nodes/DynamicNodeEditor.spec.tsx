/**
 * Tests for `DynamicNodeEditor` (Phase 6 US-176 Milestone E shell).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/user_stories/US-176-dynamic-node-editor-shell-and-hooks.md.
 *
 * The pane components are real (not stubbed) so the shell-level test
 * also covers the pane mounting + the props that wire them together.
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../../../auth/AuthContext";
import { API_BASE_URL } from "../../../shared/constants";
import { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";
import { DynamicNodeEditor } from "./DynamicNodeEditor";

// `DynamicNodeEditor` transitively renders `useActivityCatalog`, which
// calls `useGroup()` to scope its cache key per active group. We mock
// the hook directly so the shell tests don't need to wrap with
// `GroupProvider` (and pull in `AuthProvider`).
vi.mock("../../../auth/GroupContext", async () => {
  const actual = await vi.importActual<
    typeof import("../../../auth/GroupContext")
  >("../../../auth/GroupContext");
  return {
    ...actual,
    useGroup: () => ({
      availableGroups: [] as Group[],
      activeGroup: { id: "test-group-id", name: "Test Group" } as Group,
      setActiveGroup: vi.fn(),
    }),
  };
});

// `CodePane` mounts Monaco via `@monaco-editor/react`. Monaco's mount
// relies on browser primitives jsdom doesn't implement (workers,
// `IntersectionObserver`, `ResizeObserver`, `getBoundingClientRect`),
// so we stub the editor with a plain <textarea>. The shell tests just
// need to read `value` + drive `onChange`. The `codemirror-stub`
// testid name is preserved so older test assertions keep working.
vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (next: string | undefined) => void;
  }) => (
    <textarea
      data-testid="codemirror-stub"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllMocks();
});

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function renderEditor(props: Partial<Parameters<typeof DynamicNodeEditor>[0]>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <DynamicNodeEditor {...props} />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

function sampleDetail(slug: string) {
  return {
    slug,
    headVersion: {
      versionNumber: 2,
      signature: sampleSignature(slug),
      publishedAt: "2026-05-24T10:00:00.000Z",
    },
    versions: [
      {
        versionNumber: 2,
        script: `// v2 of ${slug}\n${headBoilerplate(slug)}`,
        signature: sampleSignature(slug),
        allowNet: [],
        deterministic: false,
        publishedAt: "2026-05-24T10:00:00.000Z",
      },
      {
        versionNumber: 1,
        script: `// v1 of ${slug}\n${headBoilerplate(slug)}`,
        signature: sampleSignature(slug),
        allowNet: [],
        deterministic: false,
        publishedAt: "2026-05-23T10:00:00.000Z",
      },
    ],
  };
}

function sampleSignature(slug: string) {
  return {
    name: slug,
    description: "",
    category: "Custom",
    deterministic: false,
    inputs: [],
    outputs: [{ name: "result", kind: "Artifact" }],
    paramsSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    allowNet: [],
    timeoutMs: 60_000,
    maxMemoryMB: 256,
  };
}

function headBoilerplate(slug: string): string {
  return `/**
 * @workflow-node
 * @name ${slug}
 * @description Test node
 * @inputs {}
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() { return { result: null }; }`;
}

describe("DynamicNodeEditor (US-176)", () => {
  // -----------------------------------------------------------------------
  // Scenario 2 — Three-pane Mantine layout with top-bar Publish + Delete
  // -----------------------------------------------------------------------
  it("renders three panes + Publish button in create mode (Delete hidden)", () => {
    renderEditor({});
    expect(
      screen.getByTestId("dynamic-node-editor-code-col"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dynamic-node-editor-preview-col"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dynamic-node-editor-history-col"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dynamic-node-editor-publish"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("dynamic-node-editor-delete"),
    ).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 1 + 6 — boilerplate flows into the code pane in create mode
  // -----------------------------------------------------------------------
  it("seeds the editor with the boilerplate when no slug is provided", () => {
    renderEditor({});
    const editor = screen.getByTestId("codemirror-stub") as HTMLTextAreaElement;
    expect(editor.value).toBe(DYNAMIC_NODE_BOILERPLATE);
  });

  // -----------------------------------------------------------------------
  // Scenario 6 — edit mode hydrates from useDynamicNode + Delete renders
  // -----------------------------------------------------------------------
  it("hydrates the editor from useDynamicNode in edit mode + renders Delete", async () => {
    const detail = sampleDetail("alpha");
    fetchSpy.mockResolvedValue(jsonResponse(detail));

    renderEditor({ slug: "alpha" });

    await waitFor(() => {
      const editor = screen.getByTestId(
        "codemirror-stub",
      ) as HTMLTextAreaElement;
      expect(editor.value).toBe(detail.versions[0].script);
    });

    expect(
      screen.getByTestId("dynamic-node-editor-delete"),
    ).toBeInTheDocument();

    // Sanity: the detail fetch was a GET to /api/dynamic-nodes/alpha.
    const detailCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        url === `${API_BASE_URL}/dynamic-nodes/alpha` &&
        (init as RequestInit | undefined)?.method === "GET",
    );
    expect(detailCall).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Scenario 6 — Publish in create mode = POST
  // -----------------------------------------------------------------------
  it("Publish in create mode POSTs the script to /api/dynamic-nodes", async () => {
    const publishResp = jsonResponse({
      slug: "my-custom-node",
      version: 1,
      signature: sampleSignature("my-custom-node"),
      errors: [],
    });
    fetchSpy.mockResolvedValueOnce(publishResp);

    const onAfterPublish = vi.fn();
    renderEditor({ onAfterPublish });

    // Boilerplate parses → Publish enabled.
    const publishBtn = screen.getByTestId(
      "dynamic-node-editor-publish",
    ) as HTMLButtonElement;
    await waitFor(() => expect(publishBtn.disabled).toBe(false));

    await act(async () => {
      fireEvent.click(publishBtn);
    });

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        ([url, init]) =>
          url === `${API_BASE_URL}/dynamic-nodes` &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(postCall).toBeDefined();
    });

    await waitFor(() => {
      expect(onAfterPublish).toHaveBeenCalledWith("my-custom-node");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6 — Publish in edit mode = PUT
  // -----------------------------------------------------------------------
  it("Publish in edit mode PUTs the script to /api/dynamic-nodes/:slug", async () => {
    const detail = sampleDetail("beta");
    const publishResp = jsonResponse({
      slug: "beta",
      version: 3,
      signature: sampleSignature("beta"),
      errors: [],
    });
    // The shell does an initial GET to hydrate + a second GET after
    // invalidation. The PUT lands between them.
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(publishResp)
      .mockResolvedValue(jsonResponse(detail));

    renderEditor({ slug: "beta" });

    await waitFor(() => {
      const editor = screen.getByTestId(
        "codemirror-stub",
      ) as HTMLTextAreaElement;
      expect(editor.value).toBe(detail.versions[0].script);
    });

    const publishBtn = screen.getByTestId(
      "dynamic-node-editor-publish",
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(publishBtn);
    });

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find(
        ([url, init]) =>
          url === `${API_BASE_URL}/dynamic-nodes/beta` &&
          (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5 — Publish failure surfaces a notification (red)
  // -----------------------------------------------------------------------
  it("Publish failure surfaces a red notification + leaves the editor mounted", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ message: "bad script" }, { status: 400 }),
    );

    renderEditor({});

    const publishBtn = screen.getByTestId(
      "dynamic-node-editor-publish",
    ) as HTMLButtonElement;
    await waitFor(() => expect(publishBtn.disabled).toBe(false));

    await act(async () => {
      fireEvent.click(publishBtn);
    });

    // The editor is still mounted (the three panes are still in the DOM).
    expect(
      screen.getByTestId("dynamic-node-editor-code-col"),
    ).toBeInTheDocument();

    // A red notification fired with the "Publish failed" copy.
    await waitFor(() => {
      expect(screen.getByText(/Publish failed/i)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario layout — full-page mount renders with the same panes
  // -----------------------------------------------------------------------
  it("renders both `modal` and `full-page` layouts with all three panes", () => {
    const { rerender } = renderEditor({ layout: "modal" });
    expect(
      screen.getByTestId("dynamic-node-editor").getAttribute("data-layout"),
    ).toBe("modal");
    expect(
      screen.getByTestId("dynamic-node-editor-code-col"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dynamic-node-editor-history-col"),
    ).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MantineProvider>
          <ModalsProvider>
            <Notifications />
            <DynamicNodeEditor layout="full-page" />
          </ModalsProvider>
        </MantineProvider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByTestId("dynamic-node-editor").getAttribute("data-layout"),
    ).toBe("full-page");
  });
});
