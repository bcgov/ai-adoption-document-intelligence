import "@testing-library/jest-dom";

/**
 * Mantine relies on window.matchMedia for colour-scheme handling.
 * jsdom does not implement it, so we provide a minimal stub.
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (_callback: unknown) => undefined,
    removeListener: (_callback: unknown) => undefined,
    addEventListener: (_type: string, _callback: unknown) => undefined,
    removeEventListener: (_type: string, _callback: unknown) => undefined,
    dispatchEvent: (_event: Event) => false,
  }),
});

/**
 * Mantine's floating/popover components use ResizeObserver internally.
 * jsdom does not implement it, so we provide a no-op stub.
 */
global.ResizeObserver = class ResizeObserver {
  observe(_target: Element) {
    return undefined;
  }
  unobserve(_target: Element) {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
};
