import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Where the API server listens in development. */
const DEV_API_TARGET = "http://localhost:8080";

/**
 * Whether this build is the end-to-end one, which includes the upload proof
 * harness on purpose (`docs/e2e.md`). Every other build must not.
 */
const IS_UPLOAD_PROOF_BUILD = process.env.WEB_BUILD_UPLOAD_PROOF === "true";

/**
 * Fails the build if the upload proof harness reached it.
 *
 * `vite build` takes `index.html` alone unless an input says otherwise, so
 * `upload-proof.html` and `src/upload/proof/` stay out by default (decision
 * 10). This turns that default into a rule: a later input list that names the
 * harness by accident fails here instead of shipping a page that uploads
 * whatever it is given.
 */
function _refuseUploadProofInBuild(): Plugin {
  return {
    name: "memory-shoebox:refuse-upload-proof-in-build",
    apply: "build",
    generateBundle(_options, bundle) {
      const leaked = Object.values(bundle)
        .filter((output) => {
          return (
            output.fileName.includes("upload-proof") ||
            (output.type === "chunk" &&
              output.moduleIds.some((id) => {
                return id.includes("/src/upload/proof/");
              }))
          );
        })
        .map((output) => {
          return output.fileName;
        });
      if (leaked.length > 0) {
        this.error(
          `The upload proof harness reached the build: ${leaked.join(", ")}`,
        );
      }
    },
  };
}

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
    ...(IS_UPLOAD_PROOF_BUILD ? [] : [_refuseUploadProofInBuild()]),
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
