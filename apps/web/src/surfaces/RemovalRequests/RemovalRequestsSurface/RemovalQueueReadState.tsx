import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { RemovalQueueQuery } from "./removalQueueHelpers";
type Props = {
  query: RemovalQueueQuery;
  state: "open" | "settled";
  hasRepeatedCursor: boolean;
  numRequests: number;
};
/**
 * Background read failures leave confirmed cards visible and offer recovery.
 */
export function RemovalQueueReadState({
  query,
  state,
  hasRepeatedCursor,
  numRequests,
}: Readonly<Props>): ReactNode {
  const onRetry = () => {
    void query.refetch();
  };
  return (
    <>
      {query.isPending ? (
        <Prose onPanel role="status">
          Loading requests…
        </Prose>
      ) : null}
      {query.isError || hasRepeatedCursor ? (
        <>
          <Prose onPanel role="alert">
            We could not load more requests. Please try again.
          </Prose>
          <Button variant="panel" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : null}
      {!query.isPending &&
      !query.isError &&
      !hasRepeatedCursor &&
      numRequests === 0 &&
      !query.hasNextPage ? (
        <Sheet
          wide
          label={state === "open" ? "Nothing waiting" : "Nothing settled"}
        >
          <Prose>
            {state === "open"
              ? "No requests are waiting for a response."
              : "No settled requests yet."}
          </Prose>
        </Sheet>
      ) : null}
    </>
  );
}
