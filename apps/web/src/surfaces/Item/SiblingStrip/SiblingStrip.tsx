import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";
import { burstSpanLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { SiblingLinks } from "@/surfaces/Item/SiblingStrip/SiblingLinks";

type Props = {
  detail: ItemDetail;
};

/**
 * The burst this frame came out of, kept beside it, because in a pile you are
 * always somewhere inside a run.
 *
 * The run is `burstFrames`, which the server caps at sixty. When the burst is
 * longer, the strip asks the frames route for the whole of it instead, which
 * is also what brings in the open frame when it sits past sixty. Either way
 * nothing here requests a sibling's permalink: that would be an open, and a
 * thumbnail is not one. The server latched `first_seen_at` for every visible
 * sibling when this item opened.
 */
export function SiblingStrip({ detail }: Readonly<Props>): ReactNode {
  const burst = detail.burst;
  const needsWholeRun =
    burst !== null && burst.visibleFrameCount > detail.burstFrames.length;
  const wholeRun = useQuery({
    ...burstFramesQueryOptions(burst?.burstId ?? ""),
    enabled: needsWholeRun,
  });

  if (burst === null) {
    return null;
  }
  const caption = burstSpanLabel(burst);
  return (
    <nav aria-label={caption}>
      <LabelText>{caption}</LabelText>
      <SiblingLinks
        frames={wholeRun.data?.frames ?? detail.burstFrames}
        currentItemId={detail.itemId}
        frameCount={burst.visibleFrameCount}
      />
    </nav>
  );
}
