import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { UploadSessionProvider } from "../UploadSessionProvider/UploadSessionProvider";

type Props = { children: ReactNode };
type Options = { viewer: Viewer; client: QueryClient };

/**
 * Captures one shell identity without changing StrictMode or provider order.
 */
export function makeUploadLifetimeWrapperFromViewerAndClient({
  viewer,
  client,
}: Readonly<Options>): (props: Readonly<Props>) => ReactNode {
  return function UploadLifetimeWrapper({
    children,
  }: Readonly<Props>): ReactNode {
    return (
      <StrictMode>
        <QueryClientProvider client={client}>
          <UploadSessionProvider viewer={viewer}>
            {children}
          </UploadSessionProvider>
        </QueryClientProvider>
      </StrictMode>
    );
  };
}
