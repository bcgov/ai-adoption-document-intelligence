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
import { mockNotificationsShow } from "../../../test/mockNotifications";
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
// D-13 — `CodePane` bundles Monaco locally and awaits the chunk before
// rendering `<Editor>`. Stub the loader so the 70 MB `monaco-editor` import
// never runs under jsdom; the editor surface itself is stubbed just below.
const ensureLocalMonacoMock = vi.hoisted(() =>
  vi.fn((): Promise<void> => Promise.resolve()),
);
vi.mock("./monaco-loader", () => ({
  ensureLocalMonaco: ensureLocalMonacoMock,
}));

// D8 (second cause) — `CodePane` no longer passes `value`: the editor owns its
// buffer and re-seeds are pushed imperatively through `setValue`. A controlled
// `<textarea value={…}>` cannot express that contract, so the stub mirrors the
// real one in `CodePane.spec.tsx`: uncontrolled `defaultValue`, an `onMount`
// handle whose `setValue` writes the DOM node directly (React never learns of
// it, exactly like Monaco), and `onChange` for typing.
vi.mock("@monaco-editor/react", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    default: ({
      defaultValue,
      onChange,
      onMount,
    }: {
      defaultValue?: string;
      onChange?: (next: string | undefined) => void;
      onMount?: (
        editor: {
          getValue: () => string;
          setValue: (next: string) => void;
          getModel: () => unknown;
          focus: () => void;
          setPosition: (position: unknown) => void;
          revealPositionInCenter: (position: unknown) => void;
        },
        monaco: {
          editor: { setModelMarkers: (...args: unknown[]) => void };
          MarkerSeverity: { Error: number };
          languages: {
            typescript: {
              typescriptDefaults: {
                setDiagnosticsOptions: (options: unknown) => void;
              };
            };
          };
        },
      ) => void;
    }) => {
      const nodeRef = useRef<HTMLTextAreaElement | null>(null);
      const mountedRef = useRef(false);

      useEffect(() => {
        const node = nodeRef.current;
        if (!node || mountedRef.current) return;
        mountedRef.current = true;
        onMount?.(
          {
            getValue: () => node.value,
            setValue: (next: string) => {
              node.value = next;
            },
            getModel: () => ({
              getLineCount: () => node.value.split("\n").length,
              getLineMaxColumn: (line: number) =>
                (node.value.split("\n")[line - 1] ?? "").length + 1,
            }),
            focus: () => {
              /* the stub has no cursor or markers to move */
            },
            setPosition: () => {
              /* the stub has no cursor or markers to move */
            },
            revealPositionInCenter: () => {
              /* the stub has no cursor or markers to move */
            },
          },
          {
            editor: {
              setModelMarkers: () => {
                /* markers are Monaco's own UI — nothing to draw in a stub */
              },
            },
            MarkerSeverity: { Error: 8 },
            languages: {
              typescript: {
                typescriptDefaults: {
                  setDiagnosticsOptions: () => {
                    /* no TypeScript service under jsdom to configure */
                  },
                },
              },
            },
          },
        );
      });

      return (
        <textarea
          data-testid="codemirror-stub"
          ref={nodeRef}
          defaultValue={defaultValue}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
    },
  };
});

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
  vi.useRealTimers();
  ensureLocalMonacoMock.mockImplementation(() => Promise.resolve());
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
  it("seeds the editor with the boilerplate when no slug is provided", async () => {
    renderEditor({});
    // D-13 — the editor renders only after the local Monaco chunk resolves.
    const editor = (await screen.findByTestId(
      "codemirror-stub",
    )) as HTMLTextAreaElement;
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

    // A red notification fired with the "Publish failed" copy. The global
    // test mock no-ops the toast render, so assert against the show() spy.
    await waitFor(() => {
      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Publish failed", color: "red" }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // D3 (residual) — an unreachable custom-node checker is not a script error
  // -----------------------------------------------------------------------
  it("shows the backend's sentence, hides `details` behind a toggle, and does not promise error markers", async () => {
    // What the backend now returns on 503: a human instruction as `message`,
    // the endpoint diagnostic as `details`. The script itself is the valid
    // boilerplate, so a client-side reparse produces NO markers — which is
    // exactly the case the old "— see error markers" copy lied about.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        {
          code: "DENO_RUNNER_UNAVAILABLE",
          message:
            "The custom-node checker is not running, so this script could not be type-checked. Start it, then publish again.",
          details:
            "POST http://localhost:9099/check could not be reached: fetch failed",
        },
        { status: 503 },
      ),
    );

    renderEditor({});

    const publishBtn = screen.getByTestId(
      "dynamic-node-editor-publish",
    ) as HTMLButtonElement;
    await waitFor(() => expect(publishBtn.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(publishBtn);
    });

    const alert = await screen.findByTestId(
      "dynamic-node-editor-publish-error",
    );
    expect(alert).toHaveTextContent(
      "The custom-node checker is not running, so this script could not be type-checked.",
    );
    // No markers were produced, so nothing claims there are any.
    expect(
      screen.queryByTestId("dynamic-node-editor-publish-error-markers"),
    ).not.toBeInTheDocument();
    expect(mockNotificationsShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Publish failed",
        message:
          "The custom-node checker is not running, so this script could not be type-checked. Start it, then publish again.",
      }),
    );

    // `details` is reachable but not shouted. Mantine's <Collapse> keeps its
    // child mounted at height 0, so the honest DOM-level assertion is the
    // toggle's own state, not the child's presence — jsdom cannot see height.
    const detailsToggle = screen.getByTestId(
      "dynamic-node-editor-publish-error-details-toggle",
    );
    expect(detailsToggle).toHaveTextContent("Show technical details");
    fireEvent.click(detailsToggle);
    expect(detailsToggle).toHaveTextContent("Hide technical details");
    expect(
      await screen.findByTestId("dynamic-node-editor-publish-error-details"),
    ).toHaveTextContent(
      "POST http://localhost:9099/check could not be reached: fetch failed",
    );
  });

  it("still points at the error markers when the server returned some", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        {
          message: "Publish failed (1 error)",
          errors: [
            {
              stage: "ts-check",
              message: "Type 'number' is not assignable to type 'string'.",
              line: 14,
              column: 10,
            },
          ],
        },
        { status: 400 },
      ),
    );

    renderEditor({});

    const publishBtn = screen.getByTestId(
      "dynamic-node-editor-publish",
    ) as HTMLButtonElement;
    await waitFor(() => expect(publishBtn.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(publishBtn);
    });

    expect(
      await screen.findByTestId("dynamic-node-editor-publish-error-markers"),
    ).toHaveTextContent("1 problem is marked in the editor below.");
    await waitFor(() => {
      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Publish failed",
          message: "Publish failed (1 error) — see error markers",
        }),
      );
    });
    // A 400 with no `details` field must not grow a details toggle.
    expect(
      screen.queryByTestId("dynamic-node-editor-publish-error-details-toggle"),
    ).not.toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// D-13 — Publish must refuse while the code pane cannot render the script.
// Publishing a script the author was never shown is worse than not publishing.
// ---------------------------------------------------------------------------
describe("DynamicNodeEditor — editor unavailable (D-13)", () => {
  it("disables Publish and explains why when the script editor fails to load", async () => {
    ensureLocalMonacoMock.mockImplementation(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );
    const detail = sampleDetail("alpha");
    fetchSpy.mockResolvedValue(jsonResponse(detail));

    // Edit mode: the signature parses cleanly, so the ONLY thing that can
    // block Publish here is the editor's own availability.
    renderEditor({ slug: "alpha" });

    await screen.findByTestId("code-pane-editor-failed");
    const publish = screen.getByTestId("dynamic-node-editor-publish");
    await waitFor(() => {
      expect(publish).toBeDisabled();
    });
    expect(publish).toHaveAttribute(
      "title",
      expect.stringContaining("Publishing is blocked"),
    );
  });
});

// ---------------------------------------------------------------------------
// D8 — the reviewer's "maybe this is happening when it reloads" hunch.
//
// Three modals mount this editor with `detailQuery` still loading (the canvas
// node menu, the palette, the dynamic-node settings body). The boilerplate
// shows, the author starts typing, and when the fetch lands 200–500 ms later
// `headScript` changes and the hydration effect overwrites what was typed.
// Publishing did the same thing, because it invalidates the detail query.
// ---------------------------------------------------------------------------

describe("DynamicNodeEditor — D8: a late fetch must not clobber the buffer", () => {
  it("offers no editor to type into while the detail fetch is in flight", async () => {
    // The clobber needed a window in which the author could type into the
    // boilerplate before the real script arrived. There is no such window
    // now: edit mode shows a loader until the script is in hand, exactly as
    // the full-page route always did.
    const detail = sampleDetail("alpha");
    let releaseDetail: (() => void) | undefined;
    const detailLanded = new Promise<void>((resolve) => {
      releaseDetail = resolve;
    });
    fetchSpy.mockImplementation(async () => {
      await detailLanded;
      return jsonResponse(detail);
    });

    renderEditor({ slug: "alpha" });

    expect(
      await screen.findByTestId("dynamic-node-editor-loading"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("codemirror-stub")).not.toBeInTheDocument();

    await act(async () => {
      releaseDetail?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const editor = (await screen.findByTestId(
      "codemirror-stub",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(detail.versions[0].script));
    expect(
      screen.queryByTestId("dynamic-node-editor-loading"),
    ).not.toBeInTheDocument();
  });

  it("hydrates once per lineage — the post-Publish refetch does not re-seed the buffer", async () => {
    // Publishing invalidates the detail query, so a fresh head lands a moment
    // later. Before the guard that new `headScript` was written straight into
    // the editor, discarding anything typed since the click.
    const detail = sampleDetail("alpha");
    const afterPublish = {
      ...detail,
      headVersion: { ...detail.headVersion, versionNumber: 3 },
      versions: [
        { ...detail.versions[0], versionNumber: 3, script: "// head v3" },
        ...detail.versions,
      ],
    };
    let getCount = 0;
    fetchSpy.mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "PUT") {
        return jsonResponse({
          slug: "alpha",
          version: 3,
          signature: sampleSignature("alpha"),
          errors: [],
        });
      }
      getCount += 1;
      return jsonResponse(getCount === 1 ? detail : afterPublish);
    });

    renderEditor({ slug: "alpha" });
    const editor = (await screen.findByTestId(
      "codemirror-stub",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(detail.versions[0].script));

    await act(async () => {
      fireEvent.click(screen.getByTestId("dynamic-node-editor-publish"));
    });
    // Kept typing while the publish round-trip and its refetch were in flight.
    fireEvent.change(editor, { target: { value: "// my unsaved edit" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    expect(getCount).toBeGreaterThan(1); // the refetch really happened
    expect(editor.value).toBe("// my unsaved edit");
  });

  it("revert still pushes the reverted script into the editor", async () => {
    // The once-per-lineage guard would otherwise block the one re-seed the
    // author explicitly asked for, so `handleRevert` states it directly.
    const detail = sampleDetail("alpha");
    fetchSpy.mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "PUT") {
        return jsonResponse({
          slug: "alpha",
          version: 3,
          signature: sampleSignature("alpha"),
          errors: [],
        });
      }
      return jsonResponse(detail);
    });

    renderEditor({ slug: "alpha" });
    const editor = (await screen.findByTestId(
      "codemirror-stub",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(detail.versions[0].script));

    await act(async () => {
      fireEvent.click(screen.getByTestId("version-history-revert-1"));
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByTestId("version-history-revert-confirm"),
      );
    });

    await waitFor(() => expect(editor.value).toBe(detail.versions[1].script));
  });
});
