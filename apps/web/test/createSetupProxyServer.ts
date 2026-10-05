import { createServer, type ViteDevServer } from "vite";
import viteConfig from "../vite.config";

/** Runs the real API proxy options on isolated dynamic test endpoints. */
export async function createSetupProxyServer(
  options: Readonly<{
    apiOrigin: string;
    rootDirectory: string;
  }>,
): Promise<ViteDevServer> {
  const proxyOptions = viteConfig.server?.proxy?.["/api"];
  if (typeof proxyOptions !== "object") {
    throw new Error("The development API proxy is missing.");
  }
  return createServer({
    ...viteConfig,
    configFile: false,
    root: options.rootDirectory,
    plugins: [],
    appType: "custom",
    logLevel: "silent",
    server: {
      ...viteConfig.server,
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      hmr: false,
      ws: false,
      watch: null,
      preTransformRequests: false,
      proxy: {
        "/api": { ...proxyOptions, target: options.apiOrigin },
      },
    },
  });
}
