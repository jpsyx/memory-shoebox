import type { ReactNode } from "react";
import type { TimelineSearch } from "@/api/timeline/selection/selection";
import { EmptyArchive } from "@/surfaces/Timeline/EmptyArchive/EmptyArchive";
import { FirstSignInBanner } from "@/surfaces/Timeline/TimelineSurface/FirstSignInBanner";
import { TimelinePile } from "@/surfaces/Timeline/TimelineSurface/TimelinePile";
import { useTimelineData } from "@/surfaces/Timeline/TimelineSurface/useTimelineData";

type Props = {
  search: TimelineSearch;
  /** Set once, by the route, from `takeFirstSignIn`. */
  isFirstSignIn: boolean;
};

/**
 * Surfaces 2, 5 and 6's results: the pile, filtered by whatever the URL says.
 *
 * **A filtered pile is the pile with search parameters on it**, not a second
 * surface: same spine, same prints, same stacks, and one route with query
 * parameters rather than a second results shape.
 *
 * The first-sign-in banner is drawn ahead of either state, empty or full: a
 * brand-new archive is exactly the archive a first sign-in most needs to
 * welcome somebody into.
 */
export function TimelineSurface({
  search,
  isFirstSignIn,
}: Readonly<Props>): ReactNode {
  const data = useTimelineData(search);

  return (
    <>
      {isFirstSignIn ? <FirstSignInBanner railDays={data.railDays} /> : null}
      {data.isEmptyArchive ? (
        <EmptyArchive role={data.role} />
      ) : (
        <TimelinePile data={data} search={search} />
      )}
    </>
  );
}
