import type { ReactNode } from "react";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
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
/** The phase's lede and initial promise follow the approved surface. */
export function UploadSurfaceHeading({
  snapshot,
  isAllowed,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Lede>
        {isAllowed ? _headingCopy(snapshot) : "Uploading is for posters."}
      </Lede>
      {isAllowed &&
      (snapshot.phase === "idle" || snapshot.phase === "draft") ? (
        <Prose onPanel>
          Not the best six. All of it: the blurry ones, the twelve nearly
          identical ones, the videos nobody will watch twice. Choosing between
          them is the work this is meant to save you, and the software sorts
          them onto the days they happened.
        </Prose>
      ) : null}
    </>
  );
}
