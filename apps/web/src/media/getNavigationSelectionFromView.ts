import {
  makeQueryFromView,
  type TimelineSelection,
  type TimelineView,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
/**
 * Canonical filters and the originating view's effective inclusive boundary.
 */
export function getNavigationSelectionFromView(
  view: Readonly<TimelineView>,
): TimelineSelection {
  const until = makeQueryFromView(view).get("until");
  return {
    ...view.selection,
    tags: [...new Set(view.selection.tags)].sort(),
    people: [...new Set(view.selection.people)].sort(),
    until: until ?? undefined,
  };
}
