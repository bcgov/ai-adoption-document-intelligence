import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  ],
  // Resolve needed to address plugin-react v5 fast refresh issue.
  resolve: {
    dedupe: ["react", "react-dom"],
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
});
