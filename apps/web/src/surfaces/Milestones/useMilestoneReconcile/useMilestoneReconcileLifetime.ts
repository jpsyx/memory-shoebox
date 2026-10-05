import { useEffect, useRef } from "react";
import type {
  ReconcileGuard,
  ReconcileOptions,
} from "./useMilestoneReconcile.types";
/** Retains an operation's owner while following the current routed identity. */
export function useMilestoneReconcileLifetime(
  options: Readonly<ReconcileOptions>,
): {
  current: { current: ReconcileOptions };
  guard: { current: ReconcileGuard };
} {
  const current = useRef(options);
  current.current = options;
  const guard = useRef<ReconcileGuard>({
    identity: `${options.viewer.memberId}:${options.detail.milestone.milestoneId}`,
    isMounted: true,
    isLocked: false,
    hasWritten: false,
  });
  useEffect(function trackReconcileLifetime() {
    const lifetime = guard.current;
    lifetime.isMounted = true;
    return () => {
      lifetime.isMounted = false;
    };
  }, []);
  return { current, guard };
}
