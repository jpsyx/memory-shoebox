import { createRemovalRequestRequestSchema } from "@memory-shoebox/shared";
import type { RemovalAskOperation } from "./removalAskHelpers";
import type {
  RemovalAskContext,
  RemovalAskState,
} from "./removalAskLifecycleHelpers";
import type { RemovalAsk } from "./useRemovalAsk";
type Options = {
  state: RemovalAskState;
  token: object;
  active: Set<object>;
  context: RemovalAskContext;
  memberId: string;
  itemId: string;
  mutate: (operation: RemovalAskOperation) => void;
};
/** Converts current-target state into guarded optional form actions. */
export function makeRemovalAskFromState({
  state,
  token,
  active,
  context,
  memberId,
  itemId,
  mutate,
}: Readonly<Options>): RemovalAsk {
  const { setState } = context;
  const visible =
    state.token === token
      ? state
      : { token, isPending: false, fieldErrors: {}, error: undefined };
  return {
    ...visible,
    error: visible.error,
    send: (reason) => {
      if (active.has(token)) {
        return;
      }
      const parsed = createRemovalRequestRequestSchema.safeParse({ reason });
      if (!parsed.success) {
        setState({
          token,
          isPending: false,
          fieldErrors: { reason: ["Use no more than 4,000 characters."] },
        });
        return;
      }
      active.add(token);
      setState({ token, isPending: true, fieldErrors: {} });
      mutate({
        memberId,
        itemId,
        reason: parsed.data.reason ?? "",
        token,
      });
    },
  };
}
