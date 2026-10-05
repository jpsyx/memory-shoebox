import type { ActivityFamily } from "@memory-shoebox/shared";

/** The question each durable activity family answers. */
export function activityFamilyLabel(family: ActivityFamily): string {
  return {
    authority: "Who can see what",
    destruction: "What was deleted",
    access: "Getting in",
  }[family];
}
