import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { filterFacetsQueryOptions } from "@/api/vocabularies/vocabularies";
import { FilterSheet } from "@/surfaces/Timeline/FilterSheet/FilterSheet";
import { useMilestoneAttachment } from "../../useMilestoneAttachment/useMilestoneAttachment";
import type { MilestoneAttachmentOptions } from "../../useMilestoneAttachment/useMilestoneAttachment.types";
import { MilestoneAttachmentSaved } from "./MilestoneAttachmentSaved";
import { MilestonePickerContents } from "./MilestonePickerContents";
import { useMilestonePickerCompletion } from "./useMilestonePickerCompletion";
type Props = MilestoneAttachmentOptions & {
  onDone: () => void;
  onFix: (detail: MilestoneDetail) => void;
};
/** Selectable prints with one retained delta and optional archive filters. */
export function MilestonePicker(options: Readonly<Props>): ReactNode {
  const picker = useMilestoneAttachment(options);
  const facets = useQuery({
    ...filterFacetsQueryOptions(picker.selection, options.viewer.memberId),
    enabled: options.source === "archive",
  });
  useMilestonePickerCompletion({
    picker,
    onDone: options.onDone,
    onFix: options.onFix,
  });
  if (picker.savedDetail && picker.savedCounts) {
    return (
      <MilestoneAttachmentSaved
        detail={picker.savedDetail}
        counts={picker.savedCounts}
        onDone={options.onDone}
        onFix={options.onFix}
      />
    );
  }
  return (
    <>
      {options.source === "archive" ? (
        <FilterSheet
          memberId={options.viewer.memberId}
          selection={picker.selection}
          facets={facets.data}
          onChange={picker.onSelectionChange}
        />
      ) : null}
      <MilestonePickerContents
        options={options}
        picker={picker}
        onDone={options.onDone}
      />
    </>
  );
}
