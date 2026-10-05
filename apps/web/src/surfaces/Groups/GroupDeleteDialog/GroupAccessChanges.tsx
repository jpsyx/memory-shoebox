import { Stack, Text } from "@mantine/core";
import type { GroupUsageResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = { usage: GroupUsageResponse };

/**
 * Directional item totals and affected names describe the exact usage snapshot.
 */
export function GroupAccessChanges({ usage }: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <Text>
        {usage.narrowingItemCount}{" "}
        {usage.narrowingItemCount === 1 ? "item loses" : "items lose"} access
        through this group (Only rules).
      </Text>
      <Text>
        {usage.wideningItemCount}{" "}
        {usage.wideningItemCount === 1 ? "item gains" : "items gain"} access
        through this group (Except rules).
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
          {usage.emptyAllowListItemCount}{" "}
          {usage.emptyAllowListItemCount === 1 ? "item keeps" : "items keep"} an
          empty Only list. They do not become visible to everyone. Admins and
          each item's uploader retain access.
        </Text>
      )}
    </Stack>
  );
}
