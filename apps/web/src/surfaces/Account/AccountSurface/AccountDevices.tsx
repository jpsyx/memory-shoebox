import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import { mySessionsQueryOptions } from "@/api/me/me";
import { DEVICE_LIST_FAILURE } from "@/surfaces/Account/accountCopy/accountCopy";
import { useSignOutDevice } from "@/surfaces/Account/AccountSurface/accountMutations";
import { DevicesSheet } from "@/surfaces/Account/DevicesSheet/DevicesSheet";

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
export function AccountDevices(): ReactNode {
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
