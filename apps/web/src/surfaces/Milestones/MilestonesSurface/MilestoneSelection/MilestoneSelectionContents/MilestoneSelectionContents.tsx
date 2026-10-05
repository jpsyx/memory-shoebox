import { Prose } from "@/system/typography/Prose";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MilestoneStep } from "../../MilestoneStep/MilestoneStep";
import type { Props as OwnerProps } from "../MilestoneSelection";
import { MilestoneSelectionError } from "./MilestoneSelectionError";
type Props = {
  options: OwnerProps;
  query: UseQueryResult<MilestoneDetail, Error>;
};
/** Presents the selected occasion and its read recovery. */
export function MilestoneSelectionContents({
  options,
  query,
}: Readonly<Props>): ReactNode {
  if (query.isPending) {
    return (
      <Prose onPanel role="status">
        Reading the occasion.
      </Prose>
    );
  }
  const readFailure = query.isError ? (
    <MilestoneSelectionError
      onRefresh={() => {
        void query.refetch();
      }}
      onCancel={() => {
        options.onNavigate({});
      }}
    />
  ) : null;
  if (
    query.data === undefined ||
    (query.isError &&
      !["edit", "created", "attach", "fix"].includes(options.mode ?? ""))
  ) {
    return readFailure;
  }
  return (
    <>
      {readFailure}
      <MilestoneStep
        key={`${options.memberId}:${options.milestoneId}:${options.mode}`}
        {...options}
        detail={query.data}
        hasUsableAuthority={!query.isError && !query.isFetching}
      />
    </>
  );
}
