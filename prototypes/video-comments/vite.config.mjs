import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
const root = fileURLToPath(new URL("../../", import.meta.url));
/** Standalone review server, separate from product routes and plugins. */
export default {
  root,
  resolve: {
    alias: {
      "@videojs/react/video": webRequire.resolve("@videojs/react/video"),
      "@videojs/react": webRequire.resolve("@videojs/react"),
      "react-dom": `${root}apps/web/node_modules/react-dom`,
      react: `${root}apps/web/node_modules/react`,
      "@tabler/icons-react": `${root}apps/web/node_modules/@tabler/icons-react`,
    },
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 4178, strictPort: true },
};
