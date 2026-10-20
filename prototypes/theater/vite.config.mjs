import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
/** Local-only prototype server, with no application API or credentials. */
export default {
  root,
  resolve: {
    alias: {
      "react-dom": `${root}apps/web/node_modules/react-dom`,
      react: `${root}apps/web/node_modules/react`,
      "@tabler/icons-react": `${root}apps/web/node_modules/@tabler/icons-react`,
    },
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 4186, strictPort: true },
  build: {
    outDir: "prototypes/theater/dist",
    rollupOptions: { input: `${root}prototypes/theater/index.html` },
  },
};
