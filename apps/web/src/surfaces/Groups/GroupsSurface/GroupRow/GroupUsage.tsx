import { Text } from "@mantine/core";
import type { AdminGroupDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = { group: AdminGroupDto };
function _itemRuleUsage({
  itemCount,
  mode,
}: Readonly<{ itemCount: number; mode: "Only" | "Except" }>): string {
  return `${itemCount} ${itemCount === 1 ? "item" : "items"} in ${mode} rules`;
}
/**
 * The row keeps Only and Except rule counts distinct, including unused groups.
 */
export function GroupUsage({ group }: Readonly<Props>): ReactNode {
  return group.usedByOnlyRules + group.usedByExceptRules === 0 ? (
    "Nothing yet"
  ) : (
    <>
      <Text>
        {_itemRuleUsage({ itemCount: group.usedByOnlyRules, mode: "Only" })}
      </Text>
      <Text>
        {_itemRuleUsage({ itemCount: group.usedByExceptRules, mode: "Except" })}
      </Text>
    </>
  );
}
