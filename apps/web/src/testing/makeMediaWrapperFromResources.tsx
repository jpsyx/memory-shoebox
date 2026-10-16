import type { MediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import type { ReactNode } from "react";

type Props = { children: ReactNode };

/** Keeps a lease scenario on its original resource owner across rerenders. */
export function makeMediaWrapperFromResources(
  resources: MediaLoadingResources,
): (props: Readonly<Props>) => ReactNode {
  return function MediaWrapper({ children }: Readonly<Props>): ReactNode {
    return (
      <MediaLoadingContext value={resources}>{children}</MediaLoadingContext>
    );
  };
}
