import { Stack } from "@mantine/core";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import type { NotifyPreferences, SessionDto } from "@memory-shoebox/shared";
import { deleteSession } from "@/api/auth/auth";
import { ApiRequestError } from "@/api/client/client";
import {
  MY_SESSIONS_QUERY_KEY,
  meQueryOptions,
  mySessionsQueryOptions,
  revokeMySession,
  updateMe,
} from "@/api/me/me";
import {
  accountFailure,
  DEVICE_LIST_FAILURE,
} from "@/surfaces/Account/accountCopy/accountCopy";
import { AdminDoors } from "@/surfaces/Account/AdminDoors";
import { DevicesSheet } from "@/surfaces/Account/DevicesSheet/DevicesSheet";
import { EmailSheet } from "@/surfaces/Account/EmailSheet";
import { LicenceSheet } from "@/surfaces/Account/LicenceSheet";
import { YouSheet } from "@/surfaces/Account/YouSheet";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";

/**
 * The scope both writes to the account share, which serialises them.
 *
 * **Not a nicety: without it the two silently revert each other.** Every
 * answer to `PATCH /api/me` is a whole `MeResponse`, carrying that request's
 * own snapshot of the fields it did not change, and both mutations below
 * write the answer straight into the cache. So a name save and a switch flip
 * close together can come back out of order, and whichever lands last puts
 * the other's field back as it was. `staleTime: Infinity` means nothing ever
 * refetches to correct it, so the wrong value sits there for the rest of the
 * session.
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
 * The name's save.
 *
 * It has a button, so a round trip is expected and the answer is written when
 * it lands rather than guessed at. `submittedAt` is the mutation's own record
 * of when the last attempt went out, which spares this surface a second piece
 * of state that would say the same thing.
 */
function useSaveMe() {
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
function useSaveNotify() {
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
 * A `404 session_not_found` means the row had already gone, which is not
 * worth a dialogue: `accountFailure` has the sentence, and the list is
 * refetched so the row it named disappears.
 */
function useSignOutDevice(options: Readonly<{ onSettled: () => void }>) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
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

/**
 * The devices section: its query, the two pieces of state only it needs, and
 * the three states its sheet can be in.
 *
 * Its own component so that `AccountSurface` reads as the five sheets rather
 * than as this one's query and modal bookkeeping. `now` is taken once per
 * mount rather than per render, so a re-render cannot shift a label under
 * the reader.
 *
 * **Loading and failing are designed here, because nowhere else designs
 * them.** `design-spec.md` is explicit that the prototype has no loading
 * states and that whoever builds the surface owns them. So the sheet stays on
 * screen throughout and only its middle changes: a line while the list is on
 * its way, a sentence and a "Try again" when it did not arrive, the table
 * when it did. Rendering nothing on failure would have made a failed list
 * look exactly like a slow one, and both look like an account with no
 * devices.
 *
 * **The table is still never rendered against half a list.** `sessions` is
 * undefined until the query has answered, because `daysLeftLabel` clamps an
 * expired session to "Falls out today" rather than validating it, on the
 * understanding that the list it is handed holds live sessions only.
 */
function AccountDevices(): ReactNode {
  const [now] = useState(() => {
    return new Date();
  });
  const [deviceSigningOut, setDeviceSigningOut] = useState<
    SessionDto | undefined
  >(undefined);
  const devices = useQuery(mySessionsQueryOptions);
  const signingOut = useSignOutDevice({
    onSettled: () => {
      setDeviceSigningOut(undefined);
    },
  });

  return (
    <DevicesSheet
      sessions={devices.data?.sessions}
      now={now}
      onSignOut={setDeviceSigningOut}
      deviceSigningOut={deviceSigningOut}
      isSigningOut={signingOut.isSigningOut}
      // The list's own failure wins over a sign-out's: it is the one that
      // explains why what is on screen may not be what is really there.
      error={devices.isError ? DEVICE_LIST_FAILURE : signingOut.error}
      onRetry={
        devices.isError
          ? () => {
              void devices.refetch();
            }
          : undefined
      }
      onCancel={() => {
        setDeviceSigningOut(undefined);
      }}
      onConfirm={() => {
        if (deviceSigningOut !== undefined) {
          signingOut.signOut(deviceSigningOut);
        }
      }}
    />
  );
}

/**
 * Surface 9: the name the family sees, the address codes go to, a switch per
 * kind of email, every device signed in as you, and, for an admin, the five
 * doors.
 *
 * **Every sheet below is stateless and takes what it draws as props**, which
 * is what lets each of them be tested without a router or a query client, and
 * what makes the optimistic switch write possible at all.
 *
 * Fetching lives here and in `AccountDevices`, and nowhere else in the
 * surface. The device list is the one thing that did not belong here: it is
 * the only part whose loading and failed states are drawn rather than
 * ignored, so it owns its own query instead of having five more props
 * threaded down to it from a component that never reads them.
 *
 * `meQueryOptions` is already in the cache, put there by `_app`'s guard, so
 * the suspense read is a read rather than a second request.
 *
 * The reading-width `Page`, not the wide one: `design-spec.md` § Spacing and
 * layout names the five surfaces that get `.pageWide` (Upload, Members,
 * Groups, Milestones, Who has been looking) and My account is not among
 * them, which is why the prototype uses the narrow page too.
 */
export function AccountSurface(): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const { data: account } = useSuspenseQuery(meQueryOptions);
  const savingName = useSaveMe();
  const savingNotify = useSaveNotify();

  // Unreachable: the guard redirects when nobody is signed in, and the type
  // says otherwise only because a `401` is the one refusal that is an answer.
  if (account === null) {
    return null;
  }

  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <Page>
        <Stack gap="lg">
          <Lede>
            {account.me.member.displayName}, in {settings.shoeboxName}.
          </Lede>
          <YouSheet
            me={account.me}
            onSave={savingName.save}
            isSaving={savingName.isSaving}
            savedAt={savingName.savedAt}
            error={savingName.error}
          />
          <EmailSheet
            notify={account.me.notify}
            onSave={savingNotify.save}
            isSaving={savingNotify.isSaving}
            error={savingNotify.error}
          />
          <AccountDevices />
          {viewer.isAdmin ? <AdminDoors /> : null}
          <LicenceSheet />
        </Stack>
      </Page>
    </>
  );
}
