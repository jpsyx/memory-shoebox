import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { RemovalQueueQuery } from "./removalQueueHelpers";
type Props = { query: RemovalQueueQuery };
/** Explicit continuation loads another page without replacing confirmed cards. */
export function RemovalQueueMore({ query }: Readonly<Props>): ReactNode {
  if (!query.hasNextPage) {
    return null;
  }
  return (
    <Button
      variant="default"
      disabled={query.isFetchingNextPage}
      onClick={() => {
        void query.fetchNextPage();
      }}
    >
      {query.isFetchingNextPage ? "Loading requests…" : "Load more requests"}
    </Button>
  );
}
