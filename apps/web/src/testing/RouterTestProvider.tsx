import { useState, type ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";

type Props = { children: ReactNode };

/** Supplies real link semantics to isolated component presentation tests. */
export function RouterTestProvider({ children }: Readonly<Props>): ReactNode {
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
