import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { useState, type ReactNode } from "react";
import { UploadMilestoneFix } from "../UploadMilestoneFix/UploadMilestoneFix";

type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };
/** Shows every unreviewed mismatch group for this browser's draft visit. */
export function UploadMilestonePrompts({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  return (snapshot.detail?.mismatches ?? []).map((group) => {
    const groupKey = JSON.stringify(group);
    return dismissed.has(groupKey) ? null : (
      <UploadMilestoneFix
        key={groupKey}
        group={group}
        snapshot={snapshot}
        controller={controller}
        onDismiss={() => {
          return setDismissed((current) => {
            return new Set([...current, groupKey]);
          });
        }}
      />
    );
  });
}
