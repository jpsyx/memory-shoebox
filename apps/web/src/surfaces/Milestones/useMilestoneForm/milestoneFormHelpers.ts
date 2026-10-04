import { createMilestoneBodySchema } from "@/api/milestoneHelpers/milestoneSchemas.constants";
import type { MilestoneSpan } from "@/system/MilestoneDateFields/MilestoneDateFields";
import type { ItemSummary, MilestoneDetail } from "@memory-shoebox/shared";
/** The explicit originating selection, when a caller already has one. */
export type MilestoneSelection = ReadonlyArray<
  Pick<ItemSummary, "itemId" | "capturedOn">
>;
/** Seeds fields once from stored detail or available selected capture days. */
export function getInitialMilestoneFieldsFromOptions(
  options: Readonly<{
    detail?: MilestoneDetail;
    selection?: MilestoneSelection;
  }>,
): { name: string; blurb: string; span: MilestoneSpan } {
  const dates =
    options.selection
      ?.map((item) => {
        return item.capturedOn;
      })
      .sort() ?? [];
  const startsOn = options.detail?.milestone.startsOn ?? dates[0] ?? null;
  const endsOn = options.detail?.milestone.endsOn ?? dates.at(-1) ?? null;
  return {
    name: options.detail?.milestone.name ?? "",
    blurb: options.detail?.milestone.blurb ?? "",
    span: { startsOn, endsOn, isMultiDay: startsOn !== endsOn },
  };
}
/** Validates the full form, collapsing a single day to equal inclusive ends. */
export function getMilestoneBodyFromFields(
  options: Readonly<{
    name: string;
    blurb: string;
    span: MilestoneSpan;
    selection?: MilestoneSelection;
  }>,
): ReturnType<typeof createMilestoneBodySchema.safeParse> {
  return createMilestoneBodySchema.safeParse({
    name: options.name,
    blurb: options.blurb.trim() || null,
    startsOn: options.span.startsOn,
    endsOn: options.span.isMultiDay
      ? options.span.endsOn
      : options.span.startsOn,
    ...(options.selection === undefined
      ? {}
      : {
          itemIds: options.selection.map((item) => {
            return item.itemId;
          }),
        }),
  });
}
