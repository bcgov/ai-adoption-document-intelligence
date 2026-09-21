import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const pdfjsWasmDir = join(
  dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")),
  "wasm",
);
const PDFJS_WASM_FILES = [
  "openjpeg.wasm",
  "openjpeg_nowasm_fallback.js",
  "qcms_bg.wasm",
] as const;
const PDFJS_WASM_ROUTE = "/pdfjs-wasm";

// https://vitejs.dev/config/
export default defineConfig({
  // Load .env from the monorepo root (../../) so all apps share one env file.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [
    react(),
    // Plugin to ensure PDF.js worker is served with correct MIME type
    {
      name: "configure-response-headers",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith(".mjs")) {
            res.setHeader("Content-Type", "application/javascript");
          }
          next();
        });
      },
    },
    // Serves pdfjs-dist wasm assets (OpenJPEG + QCMS) at /pdfjs-wasm/.
    // pdfjs resolves these lazily via the `wasmUrl` getDocument option
    // when decoding JPEG2000 images or wide-gamut color profiles.
    {
      name: "pdfjs-wasm-assets",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith(`${PDFJS_WASM_ROUTE}/`)) return next();
          const name = req.url.slice(PDFJS_WASM_ROUTE.length + 1).split("?")[0];
          if (!(PDFJS_WASM_FILES as readonly string[]).includes(name)) {
            return next();
          }
          const data = readFileSync(join(pdfjsWasmDir, name));
          res.setHeader(
            "Content-Type",
            name.endsWith(".wasm")
              ? "application/wasm"
              : "application/javascript",
          );
          res.end(data);
        });
      },
      generateBundle() {
        for (const name of PDFJS_WASM_FILES) {
          this.emitFile({
            type: "asset",
            fileName: `pdfjs-wasm/${name}`,
            source: readFileSync(join(pdfjsWasmDir, name)),
          });
        }
      },
    },
  ],
  optimizeDeps: {
    // G-105: `@ai-di/graph-workflow` must NOT be pre-bundled. It is aliased to
    // source below, so pre-bundling snapshots that source into
    // `node_modules/.vite/deps` — and the snapshot does not follow later edits
    // to the package. The dev server then serves a bundle missing any newly
    // added export and the editor dies with `does not provide an export
    // named …`, which is indistinguishable from a code error. This silently
    // broke the running editor for three batches of the 2026-07 fix effort.
    //
    // The `include` here was added by 3fb92206 (2026-06-10) two days AFTER the
    // source alias (8a8e9a5b), alongside a missing `index.ts` re-export in the
    // same commit — that re-export is what actually fixed the import failure.
    // Excluding it keeps the package on Vite's source path, with working HMR.
    exclude: ["@ai-di/graph-workflow"],
  },
  // Resolve needed to address plugin-react v5 fast refresh issue.
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@docs": fileURLToPath(new URL("../../docs-md", import.meta.url)),
      // Bundle graph-workflow from source: dist is CommonJS and Rollup cannot
      // resolve named exports (e.g. validateGraphConfig) from the compiled output.
      "@ai-di/graph-workflow": fileURLToPath(
        new URL(
          "../../packages/graph-workflow/src/index.browser.ts",
          import.meta.url,
        ),
      ),
      // Explicit aliases so Vite/Vitest always resolves to the same React
      // instance in all environments (prevents "Invalid hook call" in CI).
      react: fileURLToPath(
        new URL("../../node_modules/react", import.meta.url),
      ),
      "react-dom": fileURLToPath(
        new URL("../../node_modules/react-dom", import.meta.url),
      ),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      // All backend routes (including /api/auth/*) live under the /api prefix,
      // so a single rule suffices — no path rewrite needed.
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 3000,
    host: true,
    proxy: {
      // All backend routes (including /api/auth/*) live under the /api prefix,
      // so a single rule suffices — no path rewrite needed.
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
