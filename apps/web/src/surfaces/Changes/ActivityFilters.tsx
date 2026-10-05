import type { ActivityEntryDto, ActivityRequest } from "@memory-shoebox/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ActivityFamilyFilters } from "./ActivityFamilyFilters";
import { activitySubjectLabel } from "./activityCopy/activityCopy";
import classes from "./Changes.module.css";

/** URL filters compose; labels come from loaded history rather than live directories. */
export function ActivityFilters({
  filters,
  entries,
}: Readonly<{
  filters: Omit<ActivityRequest, "cursor" | "limit">;
  entries: readonly ActivityEntryDto[];
}>): ReactNode {
  const actor = entries.find((entry) => {
    return entry.actor.memberId === filters.actorMemberId;
  })?.actor.label;
  const subject = entries.find((entry) => {
    return entry.subject.id === filters.subjectId;
  })?.subject;
  const subjectLabel =
    subject === undefined ? filters.subjectId : activitySubjectLabel(subject);
  const hasFilters = Object.values(filters).some((value) => {
    return value !== undefined;
  });
  return (
    <div className={classes.filters}>
      <ActivityFamilyFilters filters={filters} />
      {filters.actorMemberId === undefined ? null : (
        <p>Changed by {actor ?? filters.actorMemberId}</p>
      )}
      {filters.subjectId === undefined ? null : <p>About {subjectLabel}</p>}
      {hasFilters ? (
        <Link to="/changes" search={{}}>
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
