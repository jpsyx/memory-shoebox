import {
  IconPlus,
  IconSearch,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { TopBar } from "@/system/Chrome/TopBar";
import { BarLink } from "@/system/ProductBar/BarLink";
import { ICON_PROPS } from "@/system/icons";
import type { MemberRole } from "@/system/memberRole";

type Props = {
  /** What this deployment calls itself: `shoebox.name`. */
  shoeboxName: string;
  /** The viewer's own name, on the way in to their account. */
  memberName: string;
  role: MemberRole;
  /** The quiet line under the name. Composed by the caller. */
  detail?: string;
};

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
  shoeboxName,
  memberName,
  role,
  detail,
}: Readonly<Props>): ReactNode {
  return (
    <TopBar title={shoeboxName} detail={detail}>
      <BarLink
        to="/"
        search={{ find: true }}
        variant="panel"
        leftSection={<IconSearch {...ICON_PROPS} />}
      >
        Find
      </BarLink>
      <BarLink
        to="/people"
        variant="panel"
        leftSection={<IconUsers {...ICON_PROPS} />}
      >
        People
      </BarLink>
      {role === "viewer" ? null : (
        <BarLink
          to="/upload"
          variant="panel-filled"
          leftSection={<IconPlus {...ICON_PROPS} />}
        >
          Add
        </BarLink>
      )}
      <BarLink
        to="/account"
        variant="panel"
        leftSection={<IconUserCircle {...ICON_PROPS} />}
      >
        {memberName}
      </BarLink>
    </TopBar>
  );
}
