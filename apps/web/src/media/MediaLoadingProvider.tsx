import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MediaLoadingContext } from "./MediaLoadingContext";
import { useMediaLoadingResources } from "./useMediaLoadingResources";

type Props = {
  memberId: string;
  routeKey: string;
  committedSurfaceKey?: string;
  children: ReactNode;
};

/** Owns member media state throughout the signed-in shell. */
export function MediaLoadingProvider({
  memberId,
  routeKey,
  committedSurfaceKey = routeKey,
  children,
}: Readonly<Props>): ReactNode {
  const resources = useMediaLoadingResources(memberId);
  const revision = useSyncExternalStore(
    resources.navigation.subscribe,
    resources.navigation.getSnapshot,
  );
  useEffect(() => {
    resources.navigation.finishSettled();
  }, [resources, revision]);
  useEffect(() => {
    resources.navigation.finishRoute();
  }, [resources, committedSurfaceKey]);
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
  useLayoutEffect(() => {
    resources.thumbnails.reset();
    window.addEventListener("scroll", resources.thumbnails.close, {
      passive: true,
    });
    return () => {
      return window.removeEventListener("scroll", resources.thumbnails.close);
    };
  }, [resources, committedSurfaceKey]);
  return (
    <MediaLoadingContext value={resources}>{children}</MediaLoadingContext>
  );
}
