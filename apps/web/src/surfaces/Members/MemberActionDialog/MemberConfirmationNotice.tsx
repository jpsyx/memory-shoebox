import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";

type Props = { isProtected: boolean; failure: string | undefined };
/** Refusal and the last-active-admin explanation remain in the confirmation. */
export function MemberConfirmationNotice({
  isProtected,
  failure,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {isProtected ? (
        <Banner>
          This is the only active admin. Make somebody else an active admin
          first.
        </Banner>
      ) : null}
      {failure === undefined ? null : (
        <div role="alert">
          <Banner>{failure}</Banner>
        </div>
      )}
    </>
  );
}
