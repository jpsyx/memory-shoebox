import { Stack } from "@mantine/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ItemDetail,
  MemberRef,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { Prose } from "@/system/typography/Prose";
import {
  VisibilityControl,
  type VisibilityMode,
} from "@/system/VisibilityControl/VisibilityControl";
import { kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";
import { usePickerOptions } from "@/surfaces/Item/WhoCanSee/usePickerOptions";
import { VisibilitySaveRow } from "@/surfaces/Item/WhoCanSee/VisibilitySaveRow";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  onDone: () => void;
};

/** Who a rule names now, which is what the field starts from. */
function _subjectIdsOf(visibility: Readonly<VisibilitySummary>): string[] {
  return visibility.subjects.map((subject) => {
    return subject.id;
  });
}

/**
 * Changing who can see it: the control pre-filled from the rule the item has,
 * then the save row under it.
 */
export function VisibilityEditor({
  detail,
  viewer,
  onDone,
}: Readonly<Props>): ReactNode {
  const options = usePickerOptions({ visibility: detail.visibility, viewer });
  const [mode, setMode] = useState<VisibilityMode>(detail.visibility.mode);
  const [subjectIds, setSubjectIds] = useState<readonly string[]>(() => {
    return _subjectIdsOf(detail.visibility);
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const isUnfinished = mode === "only" && subjectIds.length === 0;

  useEffect(function focusTheMode() {
    // Pressing Change unmounts the button that had focus, so the rule's own
    // mode takes it: the first control, and where a keyboard starts.
    rootRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }, []);

  return (
    <Stack ref={rootRef} gap="md">
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
