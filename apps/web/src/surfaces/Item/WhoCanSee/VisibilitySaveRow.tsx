import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import type { PeopleFieldGroup } from "@/system/PeopleField/PeopleField";
import { Prose } from "@/system/typography/Prose";
import type { VisibilityMode } from "@/system/VisibilityControl/VisibilityControl";
import { useSetItemVisibility } from "@/surfaces/Item/itemWrites/useSetItemVisibility";
import {
  isSameVisibility,
  makeResolveRequestFromChoice,
} from "@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers";

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
 * when it lands, and a Cancel pressed before then would not stop it. The
 * pressed Save keeps focus until then.
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
  const { visibility } = detail;

  // FocusKeepingButton, not `disabled`, which would drop the pressed
  // button's focus.
  return (
    <>
      {write.error === undefined ? null : (
        <Prose role="alert">{write.error}</Prose>
      )}
      <ChipRow>
        <FocusKeepingButton
          disabled={isUnfinished}
          isUnavailable={write.isSaving}
          onClick={() => {
            if (isSameVisibility({ visibility, mode, subjectIds })) {
              onDone();
              return;
            }
            write.save({
              variables: makeResolveRequestFromChoice({
                mode,
                subjectIds,
                groups,
              }),
              onSuccess: onDone,
            });
          }}
        >
          {write.isSaving ? "Saving" : "Save"}
        </FocusKeepingButton>
        <FocusKeepingButton
          variant="default"
          isUnavailable={write.isSaving}
          onClick={onDone}
        >
          Cancel
        </FocusKeepingButton>
      </ChipRow>
    </>
  );
}
