import { Prose } from "@/system/typography/Prose";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = { request: RemovalRequestDto };
/** Honest own outcome copy distinguishes waiting from settlement. */
export function RemovalOwnOutcome({ request }: Readonly<Props>): ReactNode {
  return (
    <>
      <Prose onPanel>
        {request.state === "open"
          ? "You have already asked about this one."
          : request.state === "withdrawn"
            ? "You withdrew this request."
            : request.state === "declined"
              ? `${request.resolvedBy?.displayName ?? "The responder"} is keeping that one.`
              : "The photograph was deleted."}
      </Prose>
      {request.state === "open" ? (
        <Prose onPanel>
          Until the uploader or an admin acts, the photograph stays where it is.
          Asking changes nothing about who can see it.
        </Prose>
      ) : null}
      {request.state === "withdrawn" ? (
        <Prose onPanel>
          The uploader and admins will be notified according to their mail
          preferences.
        </Prose>
      ) : null}
    </>
  );
}
