import { Button } from "@mantine/core";
import type { ListMembersResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";

type Props = { directory: UseQueryResult<ListMembersResponse, Error> };
/** Loading, authority refusal and recoverable read faults remain distinct. */
export function MembersReadState({ directory }: Readonly<Props>): ReactNode {
  return (
    <>
      {directory.isPending ? (
        <p role="status">Reading the member directory…</p>
      ) : null}
      {directory.isError ? (
        <div role="alert">
          <Prose>The member directory could not be read. Try again.</Prose>
          <Button
            variant="default"
            loading={directory.isFetching}
            onClick={() => {
              void directory.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {directory.data?.shape === "directory" ? (
        <Prose>Only an admin can manage members.</Prose>
      ) : null}
    </>
  );
}
