/**
 * G-003 — the editor's first keyboard shortcut.
 *
 * The single most important behaviour here is the NEGATIVE one: Ctrl+Z inside
 * a settings text field must keep doing what the browser does natively. A
 * globally-bound undo would silently break text editing in every input in the
 * feature, which would be a worse bug than the one undo/redo fixes.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUndoRedoHotkeys } from "./use-undo-redo-hotkeys";

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
});

function mount(tag: string, contentEditable = false): HTMLElement {
  const el = document.createElement(tag);
  if (contentEditable) el.setAttribute("contenteditable", "true");
  document.body.appendChild(el);
  mounted.push(el);
  return el;
}

interface KeyOpts {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: HTMLElement;
}

function press({ key, ctrlKey, metaKey, shiftKey, target }: KeyOpts) {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey,
    metaKey,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  (target ?? document.body).dispatchEvent(event);
  return event;
}

function setup(overrides: { enabled?: boolean } = {}) {
  const undo = vi.fn();
  const redo = vi.fn();
  const hook = renderHook(() =>
    useUndoRedoHotkeys({ undo, redo, enabled: overrides.enabled ?? true }),
  );
  return { undo, redo, hook };
}

describe("useUndoRedoHotkeys", () => {
  it("Ctrl+Z undoes", () => {
    const { undo, redo } = setup();
    press({ key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
  });

  it("Cmd+Z undoes on macOS-style keyboards", () => {
    const { undo } = setup();
    press({ key: "z", metaKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+Shift+Z redoes", () => {
    const { undo, redo } = setup();
    press({ key: "z", ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it("Ctrl+Y redoes", () => {
    const { undo, redo } = setup();
    press({ key: "y", ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it("handles the shifted uppercase key value browsers report", () => {
    const { redo } = setup();
    press({ key: "Z", ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("ignores a bare Z with no modifier", () => {
    const { undo, redo } = setup();
    press({ key: "z" });
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it("ignores unrelated modified keys", () => {
    const { undo, redo } = setup();
    press({ key: "s", ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  // -- the negative case: never hijack native text undo ----------------------

  it("does NOT fire while focus is in a text input", () => {
    const { undo } = setup();
    const input = mount("input");
    const event = press({ key: "z", ctrlKey: true, target: input });
    expect(undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does NOT fire while focus is in a textarea", () => {
    const { undo } = setup();
    press({ key: "z", ctrlKey: true, target: mount("textarea") });
    expect(undo).not.toHaveBeenCalled();
  });

  it("does NOT fire while focus is in a contenteditable", () => {
    const { undo } = setup();
    press({ key: "z", ctrlKey: true, target: mount("div", true) });
    expect(undo).not.toHaveBeenCalled();
  });

  it("does NOT redo from inside a text field either", () => {
    const { redo } = setup();
    press({ key: "z", ctrlKey: true, shiftKey: true, target: mount("input") });
    press({ key: "y", ctrlKey: true, target: mount("input") });
    expect(redo).not.toHaveBeenCalled();
  });

  it("preventDefault stops the browser's own history navigation", () => {
    setup();
    const event = press({ key: "z", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing when disabled", () => {
    const { undo, redo } = setup({ enabled: false });
    press({ key: "z", ctrlKey: true });
    press({ key: "y", ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it("unbinds on unmount", () => {
    const { undo, hook } = setup();
    hook.unmount();
    press({ key: "z", ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });
});
