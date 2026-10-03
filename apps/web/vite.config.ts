import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Where the API server listens in development. */
const DEV_API_TARGET = "http://localhost:8080";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      quoteStyle: "double",
      semicolons: true,
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
    }),
    react(),
  ],
  server: {
    port: 5173,
    // Proxy the API through the dev server so development matches production,
    // where one Fastify process serves both the SPA and `/api`. Same origin
    // in both places means no CORS setup and no cross-site cookies.
    proxy: {
      "/api": {
        target: DEV_API_TARGET,
        changeOrigin: true,
      },
    },
  },
  // The upload engine's media worker is a module worker so that it can load
  // libheif with a dynamic `import()`. Vite's default worker format, `iife`,
  // cannot split, and would fold libheif's 90 KB of glue into every worker
  // whether or not the browser ever needs it.
  worker: {
    format: "es",
  },
  // Vite 8 resolves tsconfig `paths` aliases natively, replacing the
  // vite-tsconfig-paths plugin.
  resolve: {
    tsconfigPaths: true,
    // Collapse react and react-dom to one instance across the pnpm workspace.
    dedupe: ["react", "react-dom"],
  },
});
