import { fileURLToPath } from "node:url";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Where the API server listens in development. */
const DEV_API_TARGET = "http://localhost:8080";

/** The app itself: the one page every build emits. */
const APP_PAGE = fileURLToPath(new URL("./index.html", import.meta.url));

/**
 * Whether this build emits the upload harness beside the app.
 *
 * **Only the end-to-end run asks**, through `E2E_BUILD_ENVIRONMENT` in
 * `e2e/support/e2eEnvironment.ts`. That run serves the built app from
 * Fastify, which is the production topology, and its upload spec drives the
 * engine through this page, so the page has to be in that build. `pnpm build`,
 * the Dockerfile and `fly deploy` never set it, so nothing that ships carries
 * the harness, and the guard below fails any other build it reaches. Vite
 * serves it in development either way.
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
  // `index.html` alone, unless this is the end-to-end build. Named rather
  // than left to Vite's default so that the one build which wants the harness
  // says so here. `rolldownOptions` is Vite 8's `rollupOptions`.
  //
  // The end-to-end build also writes to its own folder, `dist-e2e`, which the
  // run's server is pointed at (`WEB_DIST_PATH` in
  // `e2e/support/e2eEnvironment.ts`). `dist` therefore only ever holds a
  // build without the harness, so a `pnpm start` after `pnpm test:e2e` still
  // serves no harness.
  build: {
    outDir: IS_UPLOAD_PROOF_BUILD ? "dist-e2e" : "dist",
    rolldownOptions: {
      input: IS_UPLOAD_PROOF_BUILD
        ? {
            main: APP_PAGE,
            uploadProof: fileURLToPath(
              new URL("./upload-proof.html", import.meta.url),
            ),
          }
        : { main: APP_PAGE },
    },
  },
  // Vite 8 resolves tsconfig `paths` aliases natively, replacing the
  // vite-tsconfig-paths plugin.
  resolve: {
    tsconfigPaths: true,
    // Collapse react and react-dom to one instance across the pnpm workspace.
    dedupe: ["react", "react-dom"],
  },
});
