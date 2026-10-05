import { Stack, Text } from "@mantine/core";
import type { GroupUsageResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
/** Directional item totals and affected names describe the exact usage snapshot. */
export function GroupAccessChanges({
  usage,
}: Readonly<{ usage: GroupUsageResponse }>): ReactNode {
  return (
    <Stack gap="md">
      <Text>
        {usage.narrowingItemCount} items lose access through this group (Only
        rules).
      </Text>
      <Text>
        {usage.wideningItemCount} items gain access through this group (Except
        rules).
      </Text>
      <Text>
        People losing access:{" "}
        {usage.membersLosingAccess
          .map((member) => {
            return member.displayName;
          })
          .join(", ") || "Nobody"}
        .
      </Text>
      <Text>
        People gaining access:{" "}
        {usage.membersGainingAccess
          .map((member) => {
            return member.displayName;
          })
          .join(", ") || "Nobody"}
        .
      </Text>
      {usage.emptyAllowListItemCount === 0 ? null : (
        <Text>
          {usage.emptyAllowListItemCount} items keep an empty Only list. They do
          not become visible to everyone. Admins and each item's uploader retain
          access.
        </Text>
      )}
    </Stack>
  );
}
