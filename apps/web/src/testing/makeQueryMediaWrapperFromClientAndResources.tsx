import type { MediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Props = { children: ReactNode };

/** Keeps query and media owners in the same provider order during recovery. */
export function makeQueryMediaWrapperFromClientAndResources({
  client,
  resources,
}: Readonly<{
  client: QueryClient;
  resources: MediaLoadingResources;
}>): (props: Readonly<Props>) => ReactNode {
  return function QueryMediaWrapper({ children }: Readonly<Props>): ReactNode {
    return (
      <QueryClientProvider client={client}>
        <MediaLoadingContext value={resources}>{children}</MediaLoadingContext>
      </QueryClientProvider>
    );
  };
}
