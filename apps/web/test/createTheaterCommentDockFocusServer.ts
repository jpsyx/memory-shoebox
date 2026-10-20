import react from "@vitejs/plugin-react";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath as fileUrlToPath } from "node:url";

/** Serves only the dock browser fixture, without the product router or API. */
export async function createTheaterCommentDockFocusServer(): Promise<ViteDevServer> {
  const server = await createServer({
    configFile: false,
    root: fileUrlToPath(new URL("../", import.meta.url)),
    plugins: [react()],
    resolve: { tsconfigPaths: true },
    appType: "custom",
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  server.middlewares.use(
    "/__theater-comment-focus",
    async (_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(
        await server.transformIndexHtml(
          "/__theater-comment-focus",
          '<!doctype html><html><head><title>Dock focus regression</title></head><body><div id="root"></div><script type="module" src="/src/testing/TheaterCommentDockFocusHarness.tsx"></script></body></html>',
        ),
      );
    },
  );
  return server;
}
