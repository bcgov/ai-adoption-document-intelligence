/**
 * G-027 — the editor must not discard an editing session silently.
 *
 * Both halves are exercised against a real react-router data router, because
 * `useBlocker` only exists on one; that is also what the app ships
 * (`createBrowserRouter` in App.tsx).
 */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useNavigate,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNSAVED_CHANGES_MESSAGE, useUnsavedGuard } from "./use-unsaved-guard";

afterEach(() => {
  vi.restoreAllMocks();
});

function Editor({
  isDirty,
  isDirtyNow,
}: {
  isDirty: boolean;
  isDirtyNow?: () => boolean;
}) {
  useUnsavedGuard({ isDirty, isDirtyNow });
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="page">editor</span>
      <Link to="/other">go via link</Link>
      <button type="button" onClick={() => navigate("/other")}>
        go via navigate
      </button>
    </div>
  );
}

function renderEditor(props: { isDirty: boolean; isDirtyNow?: () => boolean }) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <Editor {...props} /> },
      { path: "/other", element: <span data-testid="page">other</span> },
    ],
    { initialEntries: ["/"] },
  );
  const utils = render(<RouterProvider router={router} />);
  return { ...utils, router };
}

/** Dispatches a real `beforeunload` and reports whether anything warned. */
function fireBeforeUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useUnsavedGuard", () => {
  it("does not warn when there are no unsaved changes", () => {
    renderEditor({ isDirty: false });
    expect(fireBeforeUnload()).toBe(false);
  });

  it("warns on browser unload when there are unsaved changes", () => {
    renderEditor({ isDirty: true });
    expect(fireBeforeUnload()).toBe(true);
  });

  it("stops in-app navigation when there are unsaved changes", () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => false);
    renderEditor({ isDirty: true });
    fireEvent.click(screen.getByText("go via link"));
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE);
    expect(screen.getByTestId("page")).toHaveTextContent("editor");
  });

  it("lets the navigation through once the author confirms", () => {
    vi.spyOn(window, "confirm").mockImplementation(() => true);
    renderEditor({ isDirty: true });
    fireEvent.click(screen.getByText("go via link"));
    expect(screen.getByTestId("page")).toHaveTextContent("other");
  });

  it("blocks a programmatic navigate() too, not just links", () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => false);
    renderEditor({ isDirty: true });
    fireEvent.click(screen.getByText("go via navigate"));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("page")).toHaveTextContent("editor");
  });

  it("does not ask at all when the editor is clean", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderEditor({ isDirty: false });
    fireEvent.click(screen.getByText("go via link"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("page")).toHaveTextContent("other");
  });

  it("stops warning after a save re-baselines", () => {
    // A save flips the editor's dirty compare back to clean; the guard has to
    // follow it, not latch on.
    function SaveableEditor() {
      const [dirty, setDirty] = useState(true);
      useUnsavedGuard({ isDirty: dirty });
      return (
        <button type="button" onClick={() => setDirty(false)}>
          save
        </button>
      );
    }
    const router = createMemoryRouter(
      [{ path: "/", element: <SaveableEditor /> }],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    expect(fireBeforeUnload()).toBe(true);
    fireEvent.click(screen.getByText("save"));
    expect(fireBeforeUnload()).toBe(false);
  });

  it("honours a same-tick re-baseline through isDirtyNow, before React re-renders", () => {
    // The create-save path re-baselines its refs and calls navigate() in one
    // tick. A stale boolean would pop "unsaved changes?" immediately after a
    // successful save — the getter is what prevents that.
    const confirmSpy = vi.spyOn(window, "confirm");
    let saved = false;
    renderEditor({ isDirty: true, isDirtyNow: () => !saved });
    saved = true;
    fireEvent.click(screen.getByText("go via navigate"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("page")).toHaveTextContent("other");
  });

  it("does not warn on unload once the same-tick re-baseline says clean", () => {
    let saved = false;
    renderEditor({ isDirty: true, isDirtyNow: () => !saved });
    expect(fireBeforeUnload()).toBe(true);
    saved = true;
    expect(fireBeforeUnload()).toBe(false);
  });

  it("unbinds beforeunload when the editor unmounts", () => {
    const { unmount } = renderEditor({ isDirty: true });
    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });
});
