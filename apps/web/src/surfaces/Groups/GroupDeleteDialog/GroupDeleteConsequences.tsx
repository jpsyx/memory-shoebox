import { Stack, Text } from "@mantine/core";
import type { GroupUsageResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { GroupAccessChanges } from "@/surfaces/Groups/GroupDeleteDialog/GroupAccessChanges";
import { Banner } from "@/system/Chrome/Banner";
type Props = { usage: GroupUsageResponse };

/** Names and both access directions come from the exact consent snapshot. */
export function GroupDeleteConsequences({ usage }: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      {usage.rules.length === 0 ? (
        <Text c="var(--on-print-quiet)">
          Nothing points at this group, so deleting it changes what nobody can
          see. The people in it are unaffected.
        </Text>
      ) : (
        <>
          <Banner>
            Deleting this group takes it out of every rule that names it, and
            that cuts both ways.
          </Banner>
          <GroupAccessChanges usage={usage} />
        </>
      )}
      <Text c="var(--on-print-quiet)">
        Nobody is told either way, and no photograph is deleted. The people in
        the group keep whatever they were granted by name.
      </Text>
    </Stack>
  );
}
