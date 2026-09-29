/**
 * Tests for `NodeTypeSwapModal` (US-047).
 *
 * Scenarios covered:
 *   - Renders a search input + a categorised list of all user-facing
 *     activity types (reuses `getCatalogByCategory()`, like
 *     `ActivityPalette`).
 *   - Search narrows the visible list by displayName + activityType key.
 *   - Picking an activity type fires `onPick` with the corresponding
 *     catalog key.
 *
 * The modal is rendered through Mantine's portal; tests `await
 * waitFor()` before asserting on portalled DOM, mirroring the pattern
 * `NodeContextMenu.test.tsx` already uses.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NodeTypeSwapModal } from "./NodeTypeSwapModal";

function renderModal(
  overrides: {
    opened?: boolean;
    currentActivityType?: string;
    onClose?: () => void;
    onPick?: (newActivityType: string) => void;
  } = {},
) {
  const onClose = overrides.onClose ?? vi.fn();
  const onPick = overrides.onPick ?? vi.fn();
  const utils = render(
    <MantineProvider>
      <NodeTypeSwapModal
        opened={overrides.opened ?? true}
        currentActivityType={overrides.currentActivityType ?? "data.transform"}
        onClose={onClose}
        onPick={onPick}
      />
    </MantineProvider>,
  );
  return { ...utils, onClose, onPick };
}

describe("NodeTypeSwapModal — Scenario 1: opens with a categorised activity list", () => {
  it("renders the modal title, search input, and at least one category header", async () => {
    renderModal();
    await waitFor(() => {
      expect(
        screen.getByTestId("node-type-swap-modal-search"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/change activity type/i)).toBeInTheDocument();
    // Categories come from the live catalog — assert at least one of the
    // known user-facing categories is visible.
    expect(
      screen.getByTestId("node-type-swap-category-Data Transformation"),
    ).toBeInTheDocument();
  });

  it("does not render anything when `opened` is false", () => {
    renderModal({ opened: false });
    expect(
      screen.queryByTestId("node-type-swap-modal-search"),
    ).not.toBeInTheDocument();
  });

  it("highlights the current activity type entry as the active row", async () => {
    renderModal({ currentActivityType: "data.transform" });
    await waitFor(() => {
      expect(
        screen.getByTestId("node-type-swap-entry-data.transform"),
      ).toBeInTheDocument();
    });
    const current = screen.getByTestId("node-type-swap-entry-data.transform");
    expect(current).toHaveAttribute("data-current", "true");
  });
});

describe("NodeTypeSwapModal — Scenario 2: search filters the list by displayName + activityType", () => {
  it("filters entries to those whose activityType matches the query", async () => {
    renderModal();
    await waitFor(() => {
      expect(
        screen.getByTestId("node-type-swap-modal-search"),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("node-type-swap-modal-search"), {
      target: { value: "data.transform" },
    });
    // Matching entry survives the filter.
    expect(
      screen.getByTestId("node-type-swap-entry-data.transform"),
    ).toBeInTheDocument();
    // A non-matching entry is filtered out — pick a known user-facing
    // entry from a different category.
    expect(
      screen.queryByTestId("node-type-swap-entry-file.prepare"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty-state message when the query matches nothing", async () => {
    renderModal();
    await waitFor(() => {
      expect(
        screen.getByTestId("node-type-swap-modal-search"),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("node-type-swap-modal-search"), {
      target: { value: "no_such_activity_xyz" },
    });
    expect(
      screen.getByTestId("node-type-swap-modal-empty"),
    ).toBeInTheDocument();
  });
});

describe("NodeTypeSwapModal — Scenario 3: picking a type fires onPick with the right key", () => {
  it("invokes onPick(activityType) when an entry is clicked", async () => {
    const onPick = vi.fn();
    renderModal({ currentActivityType: "data.transform", onPick });
    await waitFor(() => {
      expect(
        screen.getByTestId("node-type-swap-entry-file.prepare"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("node-type-swap-entry-file.prepare"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("file.prepare");
  });

  it("does not invoke onPick when the current type's row is clicked (no-op)", async () => {
    const onPick = vi.fn();
    renderModal({ currentActivityType: "data.transform", onPick });
    await waitFor(() => {
      expect(
        screen.getByTestId("node-type-swap-entry-data.transform"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("node-type-swap-entry-data.transform"));
    expect(onPick).not.toHaveBeenCalled();
  });
});
