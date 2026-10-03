import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { groupsQueryOptions } from "@/api/groups/groups";
import { membersQueryOptions } from "@/api/members/members";
import { Prose } from "@/system/typography/Prose";
import {
  VisibilityControl,
  type VisibilityMode,
} from "@/system/VisibilityControl/VisibilityControl";
import { kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";
import { makePickerOptionsFromSources } from "@/surfaces/Item/WhoCanSee/visibilityChoice/visibilityChoice";
import { VisibilitySaveRow } from "@/surfaces/Item/WhoCanSee/VisibilitySaveRow";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  onDone: () => void;
};

/** Who the item's rule names now, which is what the field starts from. */
function _subjectIdsOf(detail: ItemDetail): string[] {
  return detail.visibility.subjects.map((subject) => {
    return subject.id;
  });
}

/**
 * Changing who can see it: the control pre-filled from the rule the item has,
 * then the save row under it.
 *
 * The member and group lists are fetched only once this is open, which is the
 * only place they are needed.
 */
export function VisibilityEditor({
  detail,
  viewer,
  onDone,
}: Readonly<Props>): ReactNode {
  const members = useQuery(membersQueryOptions());
  const groups = useQuery(groupsQueryOptions());
  const [mode, setMode] = useState<VisibilityMode>(detail.visibility.mode);
  const [subjectIds, setSubjectIds] = useState<readonly string[]>(() => {
    return _subjectIdsOf(detail);
  });
  const options = makePickerOptionsFromSources({
    members: members.data,
    groups: groups.data,
    visibility: detail.visibility,
    viewer,
  });
  const isUnfinished = mode === "only" && subjectIds.length === 0;

  return (
    <Stack gap="md">
      <VisibilityControl
        heading={`Who can see this ${kindNoun(detail.kind)}`}
        mode={mode}
        onModeChange={setMode}
        subjects={subjectIds}
        onSubjectsChange={setSubjectIds}
        members={options.members}
        groups={options.groups}
      />
      {isUnfinished ? (
        <Prose>Name somebody first, or choose Everyone.</Prose>
      ) : null}
      <VisibilitySaveRow
        detail={detail}
        mode={mode}
        subjectIds={subjectIds}
        groups={options.groups}
        isUnfinished={isUnfinished}
        onDone={onDone}
      />
    </Stack>
  );
}
