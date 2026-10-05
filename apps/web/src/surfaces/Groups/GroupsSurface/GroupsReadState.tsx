import { Button, Stack, Text } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  ListMembersResponse,
  AdminGroupDto,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
/** List and directory failures retain their original cause and a usable Retry. */
export function GroupsReadState({
  groups,
  directory,
}: Readonly<{
  groups: UseQueryResult<{ groups: AdminGroupDto[] }, Error>;
  directory: UseQueryResult<ListMembersResponse, Error>;
}>): ReactNode {
  const error = groups.error ?? directory.error;
  return (
    <Stack gap="sm">
      {groups.isPending || directory.isPending ? (
        <Text role="status">Reading the groups…</Text>
      ) : null}
      {error === null ? null : (
        <>
          <Text role="alert">{error.message}</Text>
          <Button
            variant="quiet"
            onClick={() => {
              void groups.refetch();
              void directory.refetch();
            }}
          >
            Retry
          </Button>
        </>
      )}
    </Stack>
  );
}
