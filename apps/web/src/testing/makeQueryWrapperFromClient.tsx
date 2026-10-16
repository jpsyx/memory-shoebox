import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * Binds one test client's lifetime to a stable renderHook provider component.
 */
export function makeQueryWrapperFromClient(
  client: QueryClient,
): (props: Readonly<Props>) => ReactNode {
  return function QueryWrapper({ children }: Readonly<Props>): ReactNode {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}
