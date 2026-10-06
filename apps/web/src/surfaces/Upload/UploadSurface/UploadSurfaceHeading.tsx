import { Lede } from "@/system/typography/Lede";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { ReactNode } from "react";
function _headingCopy(snapshot: Readonly<UploadSnapshot>): string {
  return snapshot.phase === "sending"
    ? "Putting them up."
    : snapshot.phase === "resume"
      ? "You were in the middle of this."
      : snapshot.phase === "partial"
        ? `${snapshot.detail?.progress.doneCount ?? 0} up. Some did not.`
        : snapshot.phase === "done"
          ? `${snapshot.detail?.summary?.itemCount ?? snapshot.detail?.progress.doneCount ?? 0} up, across ${snapshot.detail?.summary?.dayCount ?? snapshot.detail?.days.length ?? 0} days.`
          : "Put it all up.";
}
type Props = { snapshot: UploadSnapshot; isAllowed: boolean };
/** The heading reflects the current upload phase. */
export function UploadSurfaceHeading({
  snapshot,
  isAllowed,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Lede>
        {isAllowed ? _headingCopy(snapshot) : "Uploading is for posters."}
      </Lede>
    </>
  );
}
