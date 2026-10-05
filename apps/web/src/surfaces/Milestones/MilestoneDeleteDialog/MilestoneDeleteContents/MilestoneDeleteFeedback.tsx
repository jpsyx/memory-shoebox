import { Prose } from "@/system/typography/Prose";
import type { ReactNode } from "react";
import type { Props as OwnerProps } from "./MilestoneDeleteContents";
type Props = Pick<OwnerProps, "deletion">;
/** Presents milestone delete feedback. */
export function MilestoneDeleteFeedback({
  deletion,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {" "}
      {deletion.error ? (
        <div role="alert">
          <Prose>{deletion.error}</Prose>
        </div>
      ) : null}
      {deletion.isPending ? (
        <div role="status">Updating the occasion.</div>
      ) : null}
    </>
  );
}
