import { useEffect, type ReactNode } from "react";
import { MediaLoadingContext } from "./MediaLoadingContext";
import { useMediaLoadingResources } from "./useMediaLoadingResources";

type Props = { memberId: string; routeKey: string; children: ReactNode };

/** Owns member media state throughout the signed-in shell. */
export function MediaLoadingProvider({
  memberId,
  routeKey,
  children,
}: Readonly<Props>): ReactNode {
  const resources = useMediaLoadingResources(memberId);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        resources.clearWork();
      }
    };
    const connection = (navigator as Navigator & { connection?: EventTarget })
      .connection;
    document.addEventListener("visibilitychange", onVisibility);
    connection?.addEventListener("change", resources.clearWork);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      connection?.removeEventListener("change", resources.clearWork);
      resources.clearWork();
    };
  }, [resources, routeKey]);
  return (
    <MediaLoadingContext value={resources}>{children}</MediaLoadingContext>
  );
}
