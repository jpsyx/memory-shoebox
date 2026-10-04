import type { ReactNode } from "react";
import type { VisibilitySummary } from "@memory-shoebox/shared";
import { Prose } from "@/system/typography/Prose";
type Props = { visibility: VisibilitySummary };
/** Recovery displays the saved rule without replaying or editing it. */
export function UploadSavedVisibility({
  visibility,
}: Readonly<Props>): ReactNode {
  const label =
    visibility.mode === "everyone"
      ? "Everyone"
      : `${visibility.mode === "only" ? "Only" : "Everyone except"} ${visibility.subjects
          .map((subject) => {
            return subject.displayName;
          })
          .join(", ")}`;
  return (
    <Prose>
      Your tags, people, milestones and visibility are saved. Who can see these:{" "}
      {label}.
    </Prose>
  );
}
