import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import type { PeopleFieldGroup } from "@/system/PeopleField/PeopleField";
import { Prose } from "@/system/typography/Prose";
import type { VisibilityMode } from "@/system/VisibilityControl/VisibilityControl";
import { useSetItemVisibility } from "@/surfaces/Item/itemWrites/useItemEdits";
import {
  isSameVisibility,
  makeResolveRequestFromChoice,
} from "@/surfaces/Item/WhoCanSee/visibilityChoice/visibilityChoice";

type Props = {
  detail: ItemDetail;
  mode: VisibilityMode;
  subjectIds: readonly string[];
  /** The groups the picker offers, which is how a subject's kind is known. */
  groups: readonly PeopleFieldGroup[];
  /** "Only" with nobody named, which the resolve would refuse. */
  isUnfinished: boolean;
  onDone: () => void;
};

/**
 * The visibility editor's write: what went wrong, if anything, a Save that
 * asks nothing when the choice is the rule the item already has, and a
 * Cancel. Both wait while a save is out: the save closes the editor itself
 * when it lands, and a Cancel pressed before then would not stop it.
 */
export function VisibilitySaveRow({
  detail,
  mode,
  subjectIds,
  groups,
  isUnfinished,
  onDone,
}: Readonly<Props>): ReactNode {
  const write = useSetItemVisibility(detail.itemId);

  return (
    <>
      {write.error === undefined ? null : (
        <Prose role="alert">{write.error}</Prose>
      )}
      <ChipRow>
        <Button
          disabled={isUnfinished || write.isSaving}
          onClick={() => {
            if (
              isSameVisibility({
                visibility: detail.visibility,
                mode,
                subjectIds,
              })
            ) {
              onDone();
              return;
            }
            write.save(
              makeResolveRequestFromChoice({ mode, subjectIds, groups }),
              { onSuccess: onDone },
            );
          }}
        >
          {write.isSaving ? "Saving" : "Save"}
        </Button>
        <Button variant="default" disabled={write.isSaving} onClick={onDone}>
          Cancel
        </Button>
      </ChipRow>
    </>
  );
}
