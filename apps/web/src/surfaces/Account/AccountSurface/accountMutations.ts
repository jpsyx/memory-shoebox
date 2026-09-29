import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type {
  NotifyPreferences,
  SessionDto,
  UpdateMeRequest,
} from "@memory-shoebox/shared";
import { deleteSession } from "@/api/auth/auth";
import { ApiRequestError } from "@/api/client/client";
import {
  MY_SESSIONS_QUERY_KEY,
  meQueryOptions,
  revokeMySession,
  updateMe,
} from "@/api/me/me";
import { accountFailure } from "@/surfaces/Account/accountCopy/accountCopy";

/**
 * Every write My account can make, in one file so the scope they share is
 * declared once and cannot be forgotten by the next one added.
 *
 * They are here rather than in `AccountSurface.tsx` because that file's job is
 * the five sheets: three mutation hooks in front of it made the surface itself
 * the last thing a reader reached.
 */

/**
 * The scope all three writes to the account share, which serialises them.
 *
 * **Not a nicety: without it they silently revert each other.** Every answer
 * to `PATCH /api/me` is a whole `MeResponse`, carrying that request's own
 * snapshot of the fields it did not change, and both `updateMe` mutations
 * below write the answer straight into the cache. So a name save and a switch
 * flip close together can come back out of order, and whichever lands last
 * puts the other's field back as it was. `staleTime: Infinity` means nothing
 * ever refetches to correct it, so the wrong value sits there for the rest of
 * the session.
 *
 * **Signing out is in the same scope for the same reason, from the other
 * side.** Its success for the current device empties the cache outright, so a
 * switch's `onSuccess` answering afterwards writes a `me` entry back into a
 * cache that has just been cleared, for a session that no longer exists. The
 * window is small, because the navigation to sign-in follows immediately, but
 * it is the same shape of defect as the one above and it closes the same way.
 *
 * TanStack Query runs mutations sharing a scope one at a time, so the second
 * request is sent only once the first has been applied, and its answer
 * therefore carries both changes. **It does not delay the optimistic write**,
 * which is what makes this safe to combine with the switch: `onMutate` runs
 * before the retryer that the scope gates, so a queued mutation has already
 * moved the switch.
 */
const ACCOUNT_MUTATION_SCOPE = { id: "me" } as const;

/**
 * What a sheet needs to draw one of these writes: the call, whether it is in
 * flight, and the sentence to show if it failed.
 *
 * One type for all three because all three sheets take the same three props,
 * which is the shape `YouSheet`, `EmailSheet` and `DevicesSheet` were already
 * written against.
 */
export type AccountSave<TBody> = {
  save: (body: TBody) => void;
  isSaving: boolean;
  /** Whatever went wrong, already turned into copy by `accountFailure`. */
  error: string | undefined;
};

/**
 * The name's save.
 *
 * It has a button, so a round trip is expected and the answer is written when
 * it lands rather than guessed at. `submittedAt` is the mutation's own record
 * of when the last attempt went out, which spares this surface a second piece
 * of state that would say the same thing.
 */
export function useSaveMe(): AccountSave<UpdateMeRequest> & {
  /** `Date.now()` of the last successful save, or undefined before one. */
  savedAt: number | undefined;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    scope: ACCOUNT_MUTATION_SCOPE,
    mutationFn: updateMe,
    onSuccess: (updated) => {
      queryClient.setQueryData(meQueryOptions.queryKey, updated);
    },
  });

  return {
    save: mutation.mutate,
    isSaving: mutation.isPending,
    savedAt: mutation.isSuccess ? mutation.submittedAt : undefined,
    error: mutation.error === null ? undefined : accountFailure(mutation.error),
  };
}

/**
 * The switches, which are different, and this is not optional.
 *
 * A switch moves when it is flipped, not when the server answers: the cache
 * is written in `onMutate`, before the request goes out, and rolled back in
 * `onError`. `EmailSheet` holds no state and reads `checked` straight off the
 * prop, so without this the control does nothing at all until the round trip
 * finishes, which on a phone means being tapped a second time. See decision 4
 * of the design, which settles the apparent conflict with "a switch must
 * never look flipped while unsaved": that rule refuses a separate Save button
 * for switches, it does not ask for a lagging toggle.
 *
 * `exact: true` on the cancellation, because `MY_SESSIONS_QUERY_KEY` is
 * nested under this one and the device list has nothing to do with a switch.
 */
export function useSaveNotify(): AccountSave<NotifyPreferences> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    scope: ACCOUNT_MUTATION_SCOPE,
    mutationFn: (notify: NotifyPreferences) => {
      return updateMe({ notify });
    },
    onMutate: async (notify) => {
      await queryClient.cancelQueries({
        queryKey: meQueryOptions.queryKey,
        exact: true,
      });
      const previous = queryClient.getQueryData(meQueryOptions.queryKey);
      queryClient.setQueryData(meQueryOptions.queryKey, (current) => {
        // Two different absences, treated alike: `undefined` is no cache
        // entry at all, `null` is an entry saying nobody is signed in.
        // Neither has a `notify` to flip, and neither is this mutation's to
        // invent one on, so both are handed straight back untouched.
        return current === undefined || current === null
          ? current
          : { ...current, me: { ...current.me, notify } };
      });
      return { previous };
    },
    onError: (_error, _notify, context) => {
      queryClient.setQueryData(meQueryOptions.queryKey, context?.previous);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(meQueryOptions.queryKey, updated);
    },
  });

  return {
    save: mutation.mutate,
    isSaving: mutation.isPending,
    error: mutation.error === null ? undefined : accountFailure(mutation.error),
  };
}

/**
 * Signing one device out, whichever one it is.
 *
 * **The current device uses a different route**, and the difference is only
 * which call: `DELETE /api/auth/session` exists so that a client need not
 * know its own session id. The consequence is the same, and the difference
 * the member sees is entirely in `SignOutModal`'s copy.
 *
 * On success for the current device the whole cache goes, because everything
 * in it was about a session that no longer exists. The clearing happens
 * before the navigation rather than after it, which matters in both
 * directions: `clear()` destroys each query outright, so this surface's own
 * `useSuspenseQuery` does not go back to `GET /api/me` with a cookie that has
 * just been revoked, and the sign-in surface, mounting afterwards, reads the
 * Shoebox's name fresh instead of showing its anonymous fallback.
 *
 * It shares `ACCOUNT_MUTATION_SCOPE` with the two writes above so that a
 * switch flipped a moment earlier cannot answer into the cache this has just
 * emptied. See that constant for why.
 *
 * A `404 session_not_found` means the row had already gone, which is not
 * worth a dialogue: `accountFailure` has the sentence, and the list is
 * refetched so the row it named disappears.
 */
export function useSignOutDevice(
  options: Readonly<{ onSettled: () => void }>,
): {
  signOut: (device: SessionDto) => void;
  isSigningOut: boolean;
  /** Whatever went wrong, already turned into copy by `accountFailure`. */
  error: string | undefined;
} {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    scope: ACCOUNT_MUTATION_SCOPE,
    mutationFn: (device: SessionDto) => {
      return device.isCurrent
        ? deleteSession()
        : revokeMySession(device.sessionId);
    },
    onSuccess: async (_answer, device) => {
      if (device.isCurrent) {
        queryClient.clear();
        await navigate({ to: "/sign-in" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: MY_SESSIONS_QUERY_KEY });
    },
    onError: async (error: unknown) => {
      if (
        error instanceof ApiRequestError &&
        error.code === "session_not_found"
      ) {
        await queryClient.invalidateQueries({
          queryKey: MY_SESSIONS_QUERY_KEY,
        });
      }
    },
    onSettled: options.onSettled,
  });

  return {
    signOut: mutation.mutate,
    isSigningOut: mutation.isPending,
    error: mutation.error === null ? undefined : accountFailure(mutation.error),
  };
}
