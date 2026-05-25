/**
 * Unit tests for `SourceUploadButton` (Phase 8 US-124, Phase 4 US-147).
 *
 * `describe` blocks map to the acceptance scenarios from
 * feature-docs/20260530-workflow-builder-phase8-document-sources/user_stories/US-124-source-upload-button-settings.md
 * and
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-147-upload-and-try-frontend.md.
 *
 * The test mocks `useSourceUpload` so we can drive the mutation
 * without touching the global `fetch` — the hook itself is covered
 * by `useSourceUpload.test.ts` (US-122).
 *
 * For US-147 the button is rendered inside a `RunStateTestProvider` so
 * the new `setActiveRunId` wiring (US-138 → US-147) has somewhere to
 * land. The provider value is rebuilt per test via `renderButton` so
 * each assertion gets a clean spy.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRunStateContextValue,
  type RunStateContextValue,
  RunStateTestProvider,
} from "../run/RunStateContext";
import { SourceUploadButton } from "./SourceUploadButton";
import { ApiError, type SourceUploadResponse } from "./useSourceUpload";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mutateAsync = vi.fn();
const mutationState = { isPending: false };

vi.mock("./useSourceUpload", async () => {
  const actual =
    await vi.importActual<typeof import("./useSourceUpload")>(
      "./useSourceUpload",
    );
  return {
    ...actual,
    useSourceUpload: () => ({
      mutateAsync,
      isPending: mutationState.isPending,
    }),
  };
});

vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: vi.fn(),
  },
}));

// Late-import to avoid hoist-order surprises with the vi.mock call.
import { notifications } from "@mantine/notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RenderButtonOptions {
  /** Override the `setActiveRunId` setter on the test provider. */
  setActiveRunId?: (id: string | null) => void;
  /** When `true`, render OUTSIDE a `RunStateTestProvider` (US-147 soft-fail path). */
  withoutRunStateProvider?: boolean;
}

function renderButton(
  props: Partial<React.ComponentProps<typeof SourceUploadButton>> = {},
  options: RenderButtonOptions = {},
) {
  const defaults: React.ComponentProps<typeof SourceUploadButton> = {
    workflowId: "wf-1",
    sourceNodeId: "src-upload-1",
    allowedMimeTypes: ["application/pdf", "image/*"],
  };

  const button = <SourceUploadButton {...defaults} {...props} />;

  if (options.withoutRunStateProvider) {
    return render(<MantineProvider>{button}</MantineProvider>);
  }

  const value: RunStateContextValue = buildRunStateContextValue({
    workflowId: "wf-1",
    setActiveRunId: options.setActiveRunId ?? (() => undefined),
  });

  return render(
    <MantineProvider>
      <RunStateTestProvider value={value}>{button}</RunStateTestProvider>
    </MantineProvider>,
  );
}

function makeFile(
  name = "hello.pdf",
  type = "application/pdf",
  bits = "hello world",
): File {
  return new File([bits], name, { type });
}

/**
 * Builds a full Phase 4 (US-146) success-response payload — the
 * dynamic ctxKey-keyed URL plus the `runId` / `workflowVersionId`
 * wiring fields. Tests that only care about the URL still get a
 * type-safe response, and the wiring fields can be overridden per case.
 */
function makeUploadResponse(
  overrides: Partial<SourceUploadResponse> & Record<string, string> = {},
): SourceUploadResponse {
  return {
    documentUrl: "https://blob/abc",
    runId: "run-abc-123",
    workflowVersionId: "wv-abc-123",
    ...overrides,
  };
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutationState.isPending = false;
  vi.mocked(notifications.show).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1 — Button visible only on source.upload panel
//
// (Visibility is enforced by the parent `SourceNodeSettings`; this file
// exercises the button's own behaviour. The parent assertion lives in
// SourceNodeSettings.test.tsx — see Scenario-1 block there.)
// ---------------------------------------------------------------------------

describe("Scenario 1 — button renders when mounted with required props", () => {
  it("renders the 'Upload & Try' button when workflowId is provided", () => {
    renderButton();
    const button = screen.getByTestId("source-upload-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Upload & Try");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Clicking opens OS file picker + POSTs via useSourceUpload
// ---------------------------------------------------------------------------

describe("Scenario 2 — clicking opens the file picker + invokes the upload mutation", () => {
  it("programmatically clicks the hidden <input type=file> when the button is clicked", () => {
    renderButton();
    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    const inputClickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByTestId("source-upload-button"));
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
  });

  it("calls useSourceUpload.mutateAsync(file) when a file is selected", async () => {
    mutateAsync.mockResolvedValueOnce(makeUploadResponse());
    renderButton();

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    const file = makeFile();
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const calledWith = mutateAsync.mock.calls[0][0] as File;
    expect(calledWith).toBeInstanceOf(File);
    expect(calledWith.name).toBe("hello.pdf");
    expect(calledWith.type).toBe("application/pdf");
  });

  it("wires accept= to the joined allowedMimeTypes glob list", () => {
    renderButton({ allowedMimeTypes: ["application/pdf", "image/*"] });
    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    expect(input.accept).toBe("application/pdf,image/*");
  });

  it("disables + shows the Loader while the mutation is in flight", () => {
    mutationState.isPending = true;
    renderButton();
    const button = screen.getByTestId("source-upload-button");
    expect(button).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Success surface
// ---------------------------------------------------------------------------

describe("Scenario 3 — success surface", () => {
  it("renders a green Alert with the ctxKey/URL pair on success", async () => {
    mutateAsync.mockResolvedValueOnce(makeUploadResponse());
    renderButton();

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-success"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("source-upload-button-success-url-documentUrl"),
    ).toHaveTextContent("https://blob/abc");
    expect(
      screen.getByTestId("source-upload-button-copy-documentUrl"),
    ).toBeInTheDocument();
  });

  it("fires a Mantine notification on success", async () => {
    mutateAsync.mockResolvedValueOnce(makeUploadResponse());
    renderButton();

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledTimes(1);
    });
    const arg = vi.mocked(notifications.show).mock.calls[0][0];
    expect(arg.title).toMatch(/Upload & Try succeeded/i);
    expect(arg.color).toBe("green");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — 4xx surface
// ---------------------------------------------------------------------------

describe("Scenario 4 — 4xx error surface", () => {
  it("renders a red Alert with the status + message when a 400 is thrown", async () => {
    mutateAsync.mockRejectedValueOnce(
      new ApiError(400, "Unsupported MIME type"),
    );
    renderButton();

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-error"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("source-upload-button-error")).toHaveTextContent(
      "400: Unsupported MIME type",
    );
  });

  it("renders the error Alert with the message when a 413 is thrown", async () => {
    mutateAsync.mockRejectedValueOnce(new ApiError(413, "File too large"));
    renderButton();

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-error"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("source-upload-button-error")).toHaveTextContent(
      "413: File too large",
    );
  });

  it("re-enables the button after a 4xx so the user can retry", async () => {
    mutateAsync.mockRejectedValueOnce(new ApiError(400, "Bad request"));
    renderButton();

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-error"),
      ).toBeInTheDocument();
    });
    // mutationState.isPending stays false on the mock (the hook would
    // flip it off post-error itself); the button remains enabled.
    expect(screen.getByTestId("source-upload-button")).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Button disabled when source.upload node is unsaved
// ---------------------------------------------------------------------------

describe("Scenario 5 — disabled in create mode (no workflowId)", () => {
  it("renders the button disabled with the 'Save the workflow first' tooltip", async () => {
    renderButton({ workflowId: undefined });
    const button = screen.getByTestId("source-upload-button");
    expect(button).toBeDisabled();

    // Mantine renders the tooltip label into the DOM (sometimes hidden);
    // hover to surface it and assert it's present.
    fireEvent.mouseEnter(button);
    await waitFor(() => {
      expect(screen.getByText("Save the workflow first")).toBeInTheDocument();
    });
  });

  it("does NOT call useSourceUpload.mutateAsync in create mode", () => {
    renderButton({ workflowId: undefined });
    // The hidden input isn't rendered in create mode — there's no path
    // by which `mutateAsync` could be invoked from the disabled button.
    expect(
      screen.queryByTestId("source-upload-button-input"),
    ).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// US-147 — "Upload & Try" extension
// ===========================================================================

// ---------------------------------------------------------------------------
// US-147 Scenario 1 — Button label + tooltip update
// ---------------------------------------------------------------------------

describe("US-147 Scenario 1 — button label + tooltip update", () => {
  it("renders the new 'Upload & Try' label on the enabled button", () => {
    renderButton();
    expect(screen.getByTestId("source-upload-button")).toHaveTextContent(
      "Upload & Try",
    );
  });

  it("renders the new 'Upload & Try' label in create mode too", () => {
    renderButton({ workflowId: undefined });
    expect(screen.getByTestId("source-upload-button")).toHaveTextContent(
      "Upload & Try",
    );
  });

  it("preserves the unchanged 'Save the workflow first' tooltip", async () => {
    renderButton({ workflowId: undefined });
    fireEvent.mouseEnter(screen.getByTestId("source-upload-button"));
    await waitFor(() => {
      expect(screen.getByText("Save the workflow first")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// US-147 Scenario 2 — Successful upload sets activeRunId in canvas state
// ---------------------------------------------------------------------------

describe("US-147 Scenario 2 — successful upload sets activeRunId in canvas state", () => {
  it("calls setActiveRunId(runId) with the response's runId on success", async () => {
    const setActiveRunIdSpy = vi.fn();
    mutateAsync.mockResolvedValueOnce(
      makeUploadResponse({ runId: "run-xyz-456" }),
    );
    renderButton({}, { setActiveRunId: setActiveRunIdSpy });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(setActiveRunIdSpy).toHaveBeenCalledTimes(1);
    });
    expect(setActiveRunIdSpy).toHaveBeenCalledWith("run-xyz-456");
  });

  it("keeps rendering the existing green success Alert + CopyButton (additive wiring)", async () => {
    const setActiveRunIdSpy = vi.fn();
    mutateAsync.mockResolvedValueOnce(
      makeUploadResponse({ documentUrl: "https://blob/and-try" }),
    );
    renderButton({}, { setActiveRunId: setActiveRunIdSpy });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-success"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("source-upload-button-success-url-documentUrl"),
    ).toHaveTextContent("https://blob/and-try");
    expect(
      screen.getByTestId("source-upload-button-copy-documentUrl"),
    ).toBeInTheDocument();
    // setActiveRunId fires alongside the visible alert — the wiring is additive.
    expect(setActiveRunIdSpy).toHaveBeenCalledWith("run-abc-123");
  });

  it("does NOT render runId or workflowVersionId as ctx entries in the success Alert", async () => {
    mutateAsync.mockResolvedValueOnce(makeUploadResponse());
    renderButton({}, { setActiveRunId: vi.fn() });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-success"),
      ).toBeInTheDocument();
    });
    // Wiring fields are reserved — they MUST NOT appear as ctxKey rows.
    expect(
      screen.queryByTestId("source-upload-button-success-url-runId"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(
        "source-upload-button-success-url-workflowVersionId",
      ),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-147 Scenario 4 — Cancel-on-new-Try is server-side; UI just sets the new runId
// ---------------------------------------------------------------------------

describe("US-147 Scenario 4 — UI just overwrites activeRunId; cancel is server-side", () => {
  it("overwrites the prior activeRunId with the new run's runId on a second upload", async () => {
    const setActiveRunIdSpy = vi.fn();
    // First upload returns run-1.
    mutateAsync.mockResolvedValueOnce(makeUploadResponse({ runId: "run-1" }));
    // Second upload (after the user clicks Upload & Try again with a
    // prior run still in flight on the backend) returns run-2.
    mutateAsync.mockResolvedValueOnce(makeUploadResponse({ runId: "run-2" }));

    renderButton({}, { setActiveRunId: setActiveRunIdSpy });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });
    await waitFor(() => {
      expect(setActiveRunIdSpy).toHaveBeenLastCalledWith("run-1");
    });

    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });
    await waitFor(() => {
      expect(setActiveRunIdSpy).toHaveBeenCalledTimes(2);
    });
    expect(setActiveRunIdSpy).toHaveBeenNthCalledWith(1, "run-1");
    expect(setActiveRunIdSpy).toHaveBeenNthCalledWith(2, "run-2");
  });
});

// ---------------------------------------------------------------------------
// US-147 Scenario 5 — Error handling preserved; activeRunId untouched
// ---------------------------------------------------------------------------

describe("US-147 Scenario 5 — error preserves activeRunId", () => {
  it("does NOT call setActiveRunId when the upload mutation rejects with an ApiError", async () => {
    const setActiveRunIdSpy = vi.fn();
    mutateAsync.mockRejectedValueOnce(new ApiError(413, "File too large"));

    renderButton({}, { setActiveRunId: setActiveRunIdSpy });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-error"),
      ).toBeInTheDocument();
    });
    expect(setActiveRunIdSpy).not.toHaveBeenCalled();
  });

  it("does NOT call setActiveRunId when the upload mutation rejects with a network Error", async () => {
    const setActiveRunIdSpy = vi.fn();
    mutateAsync.mockRejectedValueOnce(new Error("network down"));

    renderButton({}, { setActiveRunId: setActiveRunIdSpy });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-error"),
      ).toBeInTheDocument();
    });
    expect(setActiveRunIdSpy).not.toHaveBeenCalled();
  });

  it("keeps rendering the existing red Alert verbatim on a 4xx (Phase 8 surface preserved)", async () => {
    mutateAsync.mockRejectedValueOnce(
      new ApiError(400, "Unsupported MIME type"),
    );
    renderButton({}, { setActiveRunId: vi.fn() });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-error"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("source-upload-button-error")).toHaveTextContent(
      "400: Unsupported MIME type",
    );
  });
});

// ---------------------------------------------------------------------------
// US-147 Scenario 6 — Component test (the three cases required by AC)
// ---------------------------------------------------------------------------

describe("US-147 Scenario 6 — required component-test cases", () => {
  it("successful upload triggers setActiveRunId(runId)", async () => {
    const setActiveRunIdSpy = vi.fn();
    mutateAsync.mockResolvedValueOnce(
      makeUploadResponse({ runId: "run-success" }),
    );
    renderButton({}, { setActiveRunId: setActiveRunIdSpy });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(setActiveRunIdSpy).toHaveBeenCalledWith("run-success");
    });
  });

  it("failed upload does not modify activeRunId", async () => {
    const setActiveRunIdSpy = vi.fn();
    mutateAsync.mockRejectedValueOnce(new ApiError(400, "Bad request"));
    renderButton({}, { setActiveRunId: setActiveRunIdSpy });

    const input = screen.getByTestId(
      "source-upload-button-input",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("source-upload-button-error"),
      ).toBeInTheDocument();
    });
    expect(setActiveRunIdSpy).not.toHaveBeenCalled();
  });

  it("button label reads 'Upload & Try'", () => {
    renderButton();
    expect(screen.getByTestId("source-upload-button")).toHaveTextContent(
      "Upload & Try",
    );
  });
});
