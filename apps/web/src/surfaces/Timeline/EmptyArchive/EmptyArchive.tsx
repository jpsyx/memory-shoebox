import type { ReactNode } from "react";
import type { MemberRole } from "@memory-shoebox/shared";
import { CanUploadBody } from "@/surfaces/Timeline/EmptyArchive/CanUploadBody";
import { EmptySpine } from "@/surfaces/Timeline/EmptyArchive/EmptySpine";
import { RestrictedBody } from "@/surfaces/Timeline/EmptyArchive/RestrictedBody";
import { Archive } from "@/system/Pile/Archive";
import { DayRow } from "@/system/Pile/DayRow";
import { Ghosts } from "@/system/Pile/Ghosts";

type Props = {
  /** The viewer's own role, which is the only thing that tells these apart. */
  role: MemberRole;
};

/**
 * Surface 5, both states, drawn from one component.
 *
 * **The payload cannot tell these apart, and that is a contract.** A
 * brand-new archive and a viewer restricted from everything return
 * byte-identical bodies from `GET /api/timeline`, and no field may be added
 * that distinguishes them (`timeline.md` transformation 9). The copy is
 * therefore chosen here, from the viewer's own role, which the shell already
 * has.
 *
 * A viewer looking at a genuinely empty archive reads the restricted copy.
 * That is not a defect: it is the indistinguishability the contract asks
 * for, seen from the one side that cannot tell.
 */
export function EmptyArchive({ role }: Readonly<Props>): ReactNode {
  const canPutThingsUp = role === "admin" || role === "uploader";

  return (
    <Archive>
      <DayRow>
        <EmptySpine unitLabel={canPutThingsUp ? "Photos" : "Visible"} />
        <div>
          {canPutThingsUp ? <CanUploadBody /> : <RestrictedBody />}
          <Ghosts />
        </div>
      </DayRow>
    </Archive>
  );
}
