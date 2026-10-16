import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Props = { children: ReactNode; client: QueryClient };

/** Supplies only the query owner required by the account save hooks. */
export function AccountMutationFixture({
  children,
  client,
}: Readonly<Props>): ReactNode {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
