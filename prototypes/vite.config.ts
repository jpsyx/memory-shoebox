import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The mockup harness is a plain client-side Vite app. It has no API proxy and
 * no server: every surface renders from fixtures in `src/data`, because these
 * are mockups rather than a working product.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
});
