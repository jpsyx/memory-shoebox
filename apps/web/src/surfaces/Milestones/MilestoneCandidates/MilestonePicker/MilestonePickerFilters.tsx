import { FilterSheet } from "@/surfaces/Timeline/FilterSheet/FilterSheet";
import type { FilterFacetsResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type {
  MilestoneAttachment,
  MilestoneAttachmentOptions,
} from "../../useMilestoneAttachment/useMilestoneAttachment.types";
type Props = {
  options: MilestoneAttachmentOptions;
  picker: MilestoneAttachment;
  facets?: FilterFacetsResponse;
};
/** Offers archive filters for explicit attachment choices. */
export function MilestonePickerFilters({
  options,
  picker,
  facets,
}: Readonly<Props>): ReactNode {
  return options.source === "archive" ? (
    <FilterSheet
      memberId={options.viewer.memberId}
      selection={picker.selection}
      facets={facets}
      onChange={picker.onSelectionChange}
    />
  ) : null;
}
