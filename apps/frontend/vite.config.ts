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
  // Resolve needed to address plugin-react v5 fast refresh issue.
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
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
      "/api/auth": {
        target: "http://localhost:3002",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/auth/, "/auth"),
      },
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
