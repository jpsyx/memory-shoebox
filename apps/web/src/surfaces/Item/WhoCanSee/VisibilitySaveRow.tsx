import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import type { PeopleFieldGroup } from "@/system/PeopleField/PeopleField";
import type { VisibilityMode } from "@/system/VisibilityControl/VisibilityControl";
import { EditorSaveRow } from "@/surfaces/Item/EditorSaveRow";
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
 * The visibility editor's write: a Save that asks nothing when the choice is
 * the rule the item already has, and a Cancel.
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
  const isUnchanged = isSameVisibility({
    visibility: detail.visibility,
    mode,
    subjectIds,
  });

  return (
    <EditorSaveRow
      error={write.error}
      isSaving={write.isSaving}
      isSaveDisabled={isUnfinished}
      saveLabel="Save"
      savingLabel="Saving"
      onSave={() => {
        if (isUnchanged) {
          onDone();
          return;
        }
        const variables = makeResolveRequestFromChoice({
          mode,
          subjectIds,
          groups,
        });
        write.save({ variables, onSuccess: onDone });
      }}
      onCancel={onDone}
    />
  );
}
