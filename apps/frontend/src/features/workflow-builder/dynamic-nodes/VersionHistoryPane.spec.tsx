/**
 * Tests for `VersionHistoryPane` (Phase 6 US-179).
 *
 * Mirrors the Phase 2 Track 3 version-history coverage: list shape +
 * head-badge placement + view-modal contents + revert confirm-modal +
 * post-revert head movement.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../sources/useSourceUpload";
import type { DynamicNodeVersionDetail } from "./dynamic-node-api";
import { VersionHistoryPane } from "./VersionHistoryPane";

function sampleVersions(): DynamicNodeVersionDetail[] {
  return [
    {
      versionNumber: 3,
      script: "// v3",
      signature: {} as never,
      allowNet: [],
      deterministic: false,
      publishedAt: "2026-05-24T10:00:00.000Z",
    },
    {
      versionNumber: 2,
      script: "// v2",
      signature: {} as never,
      allowNet: [],
      deterministic: false,
      publishedAt: "2026-05-23T10:00:00.000Z",
    },
    {
      versionNumber: 1,
      script: "// v1",
      signature: {} as never,
      allowNet: [],
      deterministic: false,
      publishedAt: "2026-05-22T10:00:00.000Z",
    },
  ];
}

function renderPane(props: Parameters<typeof VersionHistoryPane>[0]) {
  return render(
    <MantineProvider>
      <ModalsProvider>
        <VersionHistoryPane {...props} />
      </ModalsProvider>
    </MantineProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("VersionHistoryPane (US-179)", () => {
  // -----------------------------------------------------------------------
  // Scenario 2 — create-mode placeholder
  // -----------------------------------------------------------------------
  it("renders the create-mode placeholder when no slug is provided", () => {
    renderPane({ versions: [] });
    expect(
      screen.getByTestId("version-history-empty-create"),
    ).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 2 — loading state
  // -----------------------------------------------------------------------
  it("renders three Skeleton rows while loading", () => {
    renderPane({
      slug: "alpha",
      isLoading: true,
      versions: [],
    });
    expect(screen.getByTestId("version-history-loading")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 2 — error state
  // -----------------------------------------------------------------------
  it("renders the error alert when the fetch fails", () => {
    renderPane({
      slug: "alpha",
      error: new ApiError(500, "boom"),
      versions: [],
    });
    expect(screen.getByTestId("version-history-error")).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 1 + 5 — newest-first list rows + head badge on the head row
  // -----------------------------------------------------------------------
  it("renders versions newest-first with the head badge on v3 only", () => {
    renderPane({
      slug: "alpha",
      versions: sampleVersions(),
      headVersionNumber: 3,
    });
    expect(screen.getByTestId("version-history-row-3")).toBeInTheDocument();
    expect(screen.getByTestId("version-history-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("version-history-row-1")).toBeInTheDocument();
    expect(
      screen.getByTestId("version-history-head-badge-3"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("version-history-head-badge-2"),
    ).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Scenario 3 — head's View is disabled; non-head's View opens the modal
  // -----------------------------------------------------------------------
  it("disables the View button on the head row", () => {
    renderPane({
      slug: "alpha",
      versions: sampleVersions(),
      headVersionNumber: 3,
    });
    const headView = screen.getByTestId(
      "version-history-view-3",
    ) as HTMLButtonElement;
    expect(headView.disabled).toBe(true);
  });

  it("opens the view modal with selected + head scripts side-by-side", async () => {
    renderPane({
      slug: "alpha",
      versions: sampleVersions(),
      headVersionNumber: 3,
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("version-history-view-2"));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("version-history-view-modal"),
      ).toBeInTheDocument();
    });

    const left = screen.getByTestId("version-history-view-left-json");
    const right = screen.getByTestId("version-history-view-right-json");
    // Mantine's <JsonInput> renders a textarea whose `value` carries the
    // script body. v2 on the left, v3 (head) on the right.
    expect((left as HTMLTextAreaElement).value).toBe("// v2");
    expect((right as HTMLTextAreaElement).value).toBe("// v3");
  });

  // -----------------------------------------------------------------------
  // Scenario 4 — Revert opens confirm modal + calls onRevert on confirm
  // -----------------------------------------------------------------------
  it("Revert opens the confirm modal + calls `onRevert` with the version on confirm", async () => {
    const onRevert = vi.fn();
    renderPane({
      slug: "alpha",
      versions: sampleVersions(),
      headVersionNumber: 3,
      onRevert,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("version-history-revert-2"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Revert to v2/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByTestId("version-history-revert-confirm");
    await act(async () => {
      fireEvent.click(confirmButton);
    });
    expect(onRevert).toHaveBeenCalledWith(sampleVersions()[1]);
  });

  it("disables the Revert button on the head row", () => {
    renderPane({
      slug: "alpha",
      versions: sampleVersions(),
      headVersionNumber: 3,
    });
    const headRevert = screen.getByTestId(
      "version-history-revert-3",
    ) as HTMLButtonElement;
    expect(headRevert.disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Scenario 5 — head badge moves after re-render with a new head number
  // -----------------------------------------------------------------------
  it("moves the head badge when `headVersionNumber` changes", () => {
    const { rerender } = renderPane({
      slug: "alpha",
      versions: sampleVersions(),
      headVersionNumber: 3,
    });
    expect(
      screen.getByTestId("version-history-head-badge-3"),
    ).toBeInTheDocument();

    // Simulate a revert → head moves to v4 (a new version added at the
    // top of the list).
    const newVersions: DynamicNodeVersionDetail[] = [
      {
        versionNumber: 4,
        script: "// v4 = revert(v2)",
        signature: {} as never,
        allowNet: [],
        deterministic: false,
        publishedAt: "2026-05-25T10:00:00.000Z",
      },
      ...sampleVersions(),
    ];
    rerender(
      <MantineProvider>
        <ModalsProvider>
          <VersionHistoryPane
            slug="alpha"
            versions={newVersions}
            headVersionNumber={4}
          />
        </ModalsProvider>
      </MantineProvider>,
    );
    expect(
      screen.getByTestId("version-history-head-badge-4"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("version-history-head-badge-3"),
    ).not.toBeInTheDocument();
  });
});

// Silence unused-import warning — `within` is left here in case
// follow-up tests need to scope queries to a single row.
void within;
