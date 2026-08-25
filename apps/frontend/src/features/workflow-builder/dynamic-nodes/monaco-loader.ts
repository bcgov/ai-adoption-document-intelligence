/**
 * Local Monaco wiring for the dynamic-node script editor (D-13).
 *
 * `@monaco-editor/react` defaults to fetching Monaco's AMD loader and every
 * chunk from `cdn.jsdelivr.net` at runtime. That made the script editor
 * silently dependent on public-internet reach from the *browser*: behind an
 * egress proxy, on an air-gapped deploy, or with the CDN simply blocked, the
 * pane sat on "Loading…" forever — and Publish stayed enabled, so an author
 * could ship a script they had never been shown.
 *
 * `loader.config({ monaco })` points the React wrapper at the copy bundled
 * from `node_modules` instead, so the editor ships with the app. The import
 * is dynamic on purpose: Monaco is large, and this keeps it out of every
 * bundle except the one chunk the editor actually needs.
 *
 * Callers must await {@link ensureLocalMonaco} BEFORE rendering `<Editor>`.
 * The wrapper reads its loader config once, at first init — configuring it
 * after an `<Editor>` has mounted is a no-op and would silently fall back to
 * the CDN.
 */

import { loader } from "@monaco-editor/react";
import type { Environment } from "monaco-editor";

/**
 * Memoised so concurrent `CodePane`s (and remounts) configure once. A
 * rejected promise is deliberately NOT cached — a chunk fetch that failed on
 * a flaky network should be retryable by reopening the editor.
 */
let configurePromise: Promise<void> | null = null;

export function ensureLocalMonaco(): Promise<void> {
  configurePromise ??= configureLocalMonaco().catch((err: unknown) => {
    configurePromise = null;
    throw err;
  });
  return configurePromise;
}

async function configureLocalMonaco(): Promise<void> {
  const [monaco, editorWorker, tsWorker] = await Promise.all([
    import("monaco-editor"),
    import("monaco-editor/esm/vs/editor/editor.worker?worker"),
    import("monaco-editor/esm/vs/language/typescript/ts.worker?worker"),
  ]);

  // Monaco resolves its workers through this global. Without it the bundled
  // build looks for them relative to the page URL and logs
  // "Could not create web worker" on every mount.
  const environment: Environment = {
    getWorker(_workerId: string, label: string): Worker {
      return label === "typescript" || label === "javascript"
        ? new tsWorker.default()
        : new editorWorker.default();
    },
  };
  (self as unknown as { MonacoEnvironment: Environment }).MonacoEnvironment =
    environment;

  loader.config({ monaco });
}
