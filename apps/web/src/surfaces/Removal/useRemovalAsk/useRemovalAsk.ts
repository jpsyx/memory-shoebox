import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { makeRemovalAskFromState } from "./makeRemovalAskFromState";
import type { RemovalAskState } from "./removalAskLifecycleHelpers";
import { useRemovalAskMutation } from "./useRemovalAskMutation";
/**
 * Optional asking with retained errors and immediate duplicate-write
 * protection.
 */
export type RemovalAsk = {
  send: (reason: string) => void;
  isPending: boolean;
  error: string | undefined;
  fieldErrors: Record<string, string[]>;
};

/**
 * Captures item/member generation for writes and suppresses old completion
 * notices.
 */
export function useRemovalAsk({
  memberId,
  itemId,
  onCreated,
}: Readonly<{
  memberId: string;
  itemId: string;
  onCreated: (request: RemovalRequestDto) => void;
}>): RemovalAsk {
  const queryClient = useQueryClient();
  const key = `${memberId}:${itemId}`;
  const targetRef = useRef({ key, token: {} });
  if (targetRef.current.key !== key) {
    targetRef.current = { key, token: {} };
  }
  const { token } = targetRef.current;
  const active = useRef(new Set<object>()).current;
  const blocked = useRef(new Set<string>()).current;
  const [state, setState] = useState<RemovalAskState>({
    token,
    isPending: false,
    fieldErrors: {},
  });
  useEffect(function isolateUnmountedAsk() {
    return () => {
      targetRef.current = { key: "", token: {} };
    };
  }, []);
  const context = { queryClient, targetRef, setState, onCreated, blocked };
  const mutate = useRemovalAskMutation({ context, active, memberId, itemId });
  return makeRemovalAskFromState({
    state,
    token,
    active,
    context,
    memberId,
    itemId,
    mutate,
  });
}
