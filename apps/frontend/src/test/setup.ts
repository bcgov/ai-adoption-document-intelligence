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
 * Mantine's FileInput and related tests use DataTransfer for building
 * mock FileLists. jsdom does not implement DataTransfer, so we provide
 * a minimal stub that supports the `items.add(file)` and `files` API.
 */
class MockDataTransfer {
  private _files: File[] = [];

  readonly items = {
    add: (file: File) => {
      this._files.push(file);
    },
  };

  get files(): FileList {
    const list = [...this._files] as unknown as FileList;
    Object.defineProperty(list, "item", {
      value: (i: number) => this._files[i] ?? null,
    });
    return list;
  }
}

(globalThis as Record<string, unknown>).DataTransfer =
  MockDataTransfer as unknown as typeof DataTransfer;

/**
 * Mantine's floating/popover components use ResizeObserver internally.
 * jsdom does not implement it, so we provide a no-op stub.
 */
(globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
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

/**
 * Mantine's Combobox calls scrollIntoView on option elements to scroll the
 * highlighted item into view. jsdom does not implement it, so we provide a
 * no-op stub to prevent unhandled TypeError exceptions during tests.
 */
Element.prototype.scrollIntoView = function () {
  return undefined;
};
