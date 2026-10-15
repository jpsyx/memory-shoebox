import { useState, type ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";

/** Supplies real link semantics to isolated component presentation tests. */
export function RouterTestProvider({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  const [router] = useState(() => {
    return createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    });
  });
  return (
    <RouterContextProvider router={router}>{children}</RouterContextProvider>
  );
}
