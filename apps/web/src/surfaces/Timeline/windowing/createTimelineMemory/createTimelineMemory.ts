import type { TimelineViewMemory } from "../timelineWindow.types";
/** Bounded member-owned compact view cache. */
export type TimelineMemory = {
  get: (key: string) => TimelineViewMemory;
  expand: ({
    viewKey,
    burstId,
    height,
  }: Readonly<{ viewKey: string; burstId: string; height: number }>) => void;
  clear: () => void;
};
/** Authority-owned compact positions, never query pages or media sources. */
export function createTimelineMemory(): TimelineMemory {
  const views = new Map<string, TimelineViewMemory>();
  const get = (key: string): TimelineViewMemory => {
    const view = views.get(key) ?? { expanded: new Map() };
    views.delete(key);
    views.set(key, view);
    if (views.size > 20) {
      views.delete(views.keys().next().value!);
    }
    return view;
  };
  return {
    get,
    expand: ({
      viewKey,
      burstId,
      height,
    }: Readonly<{ viewKey: string; burstId: string; height: number }>) => {
      const view = get(viewKey);
      view.expanded.delete(burstId);
      view.expanded.set(burstId, { height });
      if (view.expanded.size > 20) {
        view.expanded.delete(view.expanded.keys().next().value!);
      }
    },
    clear: () => {
      return views.clear();
    },
  };
}
