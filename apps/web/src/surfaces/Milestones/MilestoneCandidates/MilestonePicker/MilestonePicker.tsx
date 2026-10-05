import { makeFilterFacetsQueryOptionsFromSelection } from "@/api/vocabularies/vocabularies";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMilestoneAttachment } from "../../useMilestoneAttachment/useMilestoneAttachment";
import type { MilestoneAttachmentOptions } from "../../useMilestoneAttachment/useMilestoneAttachment.types";
import { MilestoneAttachmentSaved } from "./MilestoneAttachmentSaved";
import { MilestonePickerContents } from "./MilestonePickerContents";
import { MilestonePickerFilters } from "./MilestonePickerFilters";
import { useMilestonePickerCompletion } from "./useMilestonePickerCompletion";
type Props = MilestoneAttachmentOptions & {
  onDone: () => void;
  onFix: (detail: MilestoneDetail) => void;
};
/** Selectable prints with one retained delta and optional archive filters. */
export function MilestonePicker({
  viewer,
  onDone,
  onFix,
  ...attachmentOptions
}: Readonly<Props>): ReactNode {
  const options = { viewer, onDone, onFix, ...attachmentOptions };
  const picker = useMilestoneAttachment(options);
  const facets = useQuery({
    ...makeFilterFacetsQueryOptionsFromSelection({
      selection: picker.selection,
      memberId: options.viewer.memberId,
    }),
    enabled: options.source === "archive",
  });
  useMilestonePickerCompletion({
    picker,
    onDone: options.onDone,
    onFix: options.onFix,
  });
  return picker.savedDetail && picker.savedCounts ? (
    <MilestoneAttachmentSaved
      detail={picker.savedDetail}
      counts={picker.savedCounts}
      onDone={options.onDone}
      onFix={options.onFix}
    />
  ) : (
    <MilestonePickerContents
      options={options}
      picker={picker}
      onDone={options.onDone}
      filters={
        <MilestonePickerFilters
          options={options}
          picker={picker}
          facets={facets.data}
        />
      }
    />
  );
}
