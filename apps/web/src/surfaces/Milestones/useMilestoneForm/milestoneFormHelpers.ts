import { createMilestoneBodySchema } from "@/api/milestoneHelpers/milestoneSchemas.constants";
import type { MilestoneSpan } from "@/system/MilestoneDateFields/MilestoneDateFields";
import type { ItemSummary, MilestoneDetail } from "@memory-shoebox/shared";
type MilestoneBodyFields = {
  name: string;
  blurb: string;
  span: MilestoneSpan;
  selection?: MilestoneSelection;
};

/** The explicit originating selection, when a caller already has one. */
export type MilestoneSelection = Array<
  Pick<ItemSummary, "itemId" | "capturedOn">
>;
/** Seeds fields once from stored detail or available selected capture days. */
export function makeInitialMilestoneFieldsFromOptions({
  detail,
  selection = [],
}: Readonly<{
  detail?: MilestoneDetail;
  selection?: Readonly<MilestoneSelection>;
}>): { name: string; blurb: string; span: MilestoneSpan } {
  const dates = selection
    .map((item) => {
      return item.capturedOn;
    })
    .sort();
  const startsOn = detail?.milestone.startsOn ?? dates[0];
  const endsOn = detail?.milestone.endsOn ?? dates.at(-1);
  return {
    name: detail?.milestone.name ?? "",
    blurb: detail?.milestone.blurb ?? "",
    span: { startsOn, endsOn, isMultiDay: startsOn !== endsOn },
  };
}
/** Validates the full form, collapsing a single day to equal inclusive ends. */
export function makeMilestoneBodyParseResultFromFields(
  options: Readonly<
    Omit<MilestoneBodyFields, "selection" | "span"> & {
      selection?: Readonly<MilestoneSelection>;
      span: Readonly<MilestoneSpan>;
    }
  >,
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
