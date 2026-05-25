/**
 * Unit tests for `SourceUploadButton` (US-124).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260530-workflow-builder-phase8-document-sources/user_stories/US-124-source-upload-button-settings.md.
 *
 * The test mocks `useSourceUpload` so we can drive the mutation
 * without touching the global `fetch` — the hook itself is covered
 * by `useSourceUpload.test.ts` (US-122).
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
import { SourceUploadButton } from "./SourceUploadButton";
import { ApiError } from "./useSourceUpload";

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

function renderButton(
  props: Partial<React.ComponentProps<typeof SourceUploadButton>> = {},
) {
  const defaults: React.ComponentProps<typeof SourceUploadButton> = {
    workflowId: "wf-1",
    sourceNodeId: "src-upload-1",
    allowedMimeTypes: ["application/pdf", "image/*"],
  };
  return render(
    <MantineProvider>
      <SourceUploadButton {...defaults} {...props} />
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
  it("renders the 'Test upload' button when workflowId is provided", () => {
    renderButton();
    const button = screen.getByTestId("source-upload-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Test upload");
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
    mutateAsync.mockResolvedValueOnce({ documentUrl: "https://blob/abc" });
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
    mutateAsync.mockResolvedValueOnce({ documentUrl: "https://blob/abc" });
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
    mutateAsync.mockResolvedValueOnce({ documentUrl: "https://blob/abc" });
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
    expect(arg.title).toMatch(/Test upload succeeded/i);
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
