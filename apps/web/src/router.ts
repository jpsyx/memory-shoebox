import { createRouter } from "@tanstack/react-router";
import { queryClient } from "@/queryClient";
import { routeTree } from "@/routeTree.gen";

/**
 * The application router. The route tree is generated automatically by the
 * TanStack Router Vite plugin from the files in `src/routes`. Do not edit
 * `routeTree.gen.ts` by hand.
 */
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});

// Register the router instance for full type safety across the app.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
