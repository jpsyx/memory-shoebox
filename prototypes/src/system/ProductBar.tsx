import { Button } from "@mantine/core";
import {
  IconPlus,
  IconSearch,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";
import {
  ARCHIVE_TOTAL,
  CURRENT_MEMBER,
  SHOEBOX_NAME,
  MEMBERS,
  type Role,
} from "@/data/fixtures";
import { TopBar } from "@/system/Chrome";
import { ICON_PROPS } from "@/system/icons";
import type { ReactNode } from "react";

/**
 * The product's own top bar.
 *
 * Four plain buttons, never a menu and never a drawer: the pile is the
 * interface, and everything an interface hides behind a hamburger is
 * something this audience will not find. Upload only appears for the roles
 * that can, because a viewer should not be shown an affordance they do not
 * have.
 *
 * Admin surfaces are reached from My account rather than from here. A fifth
 * and sixth button on the bar would cost more than the shortcut is worth, and
 * an admin is by definition the one person who will go looking.
 */
export function ProductBar({
  role = CURRENT_MEMBER.role,
  detail,
}: {
  readonly role?: Role;
  readonly detail?: string;
}): ReactNode {
  const activeMembers = MEMBERS.filter((member) => {
    return member.status === "active";
  }).length;

  return (
    <TopBar
      title={SHOEBOX_NAME}
      detail={
        detail ??
        `${ARCHIVE_TOTAL.toLocaleString("en-GB")} photos and videos · ${activeMembers} people`
      }
    >
      <Button variant="panel" leftSection={<IconSearch {...ICON_PROPS} />}>
        Find
      </Button>
      <Button variant="panel" leftSection={<IconUsers {...ICON_PROPS} />}>
        People
      </Button>
      {role === "viewer" ? null : (
        <Button leftSection={<IconPlus {...ICON_PROPS} />}>Add</Button>
      )}
      <Button variant="panel" leftSection={<IconUserCircle {...ICON_PROPS} />}>
        {CURRENT_MEMBER.name}
      </Button>
    </TopBar>
  );
}
