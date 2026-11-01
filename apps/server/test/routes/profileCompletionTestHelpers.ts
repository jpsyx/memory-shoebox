import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";

/** Shared profile completion clock for focused local regression scenarios. */
export const profileCompletionClock = (): Date => {
  return new Date(NOW);
};
