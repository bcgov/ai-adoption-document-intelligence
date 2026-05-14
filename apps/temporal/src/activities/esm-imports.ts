/**
 * ESM dynamic import helpers.
 *
 * TypeScript compiles `import("pkg")` to `require("pkg")` in CommonJS output.
 * Node 22+ can `require()` ESM modules only when they contain no top-level
 * `await`. Both `mupdf` and `tesseract.js` have top-level awaits, so they must
 * be loaded via a true `import()` expression.
 *
 * Wrapping the import in `new Function(...)` keeps the call opaque to the
 * TypeScript compiler, ensuring it is emitted as a genuine `import()` in the
 * compiled CJS output rather than being transformed to `require()`.
 *
 * Isolation in a dedicated module lets tests mock this file with
 * `jest.mock('./esm-imports', ...)` without needing `--experimental-vm-modules`.
 */

/**
 * Loads the mupdf module via a true ESM dynamic import.
 *
 * @returns The default export of the mupdf package.
 */
export async function loadMupdf(): Promise<typeof import("mupdf")["default"]> {
  const esmImport = new Function("m", "return import(m)") as (
    m: string,
  ) => Promise<{ default: typeof import("mupdf")["default"] }>;
  return esmImport("mupdf").then((m) => m.default);
}

/**
 * Loads the tesseract.js module via a true ESM dynamic import.
 *
 * @returns The tesseract.js module namespace.
 */
export async function loadTesseract(): Promise<typeof import("tesseract.js")> {
  const esmImport = new Function("m", "return import(m)") as (
    m: string,
  ) => Promise<typeof import("tesseract.js")>;
  return esmImport("tesseract.js");
}
