import { useEffect, useRef, type RefObject } from "react";
/** Tracks whether completion still belongs to this mounted removal page. */
export function useRemovalPageLifetime(): RefObject<boolean> {
  const isMounted = useRef(true);
  useEffect(function isolateRemovalPageCompletion() {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return isMounted;
}
