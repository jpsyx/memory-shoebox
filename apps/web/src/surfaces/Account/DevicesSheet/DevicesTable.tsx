import { Table } from "@mantine/core";
import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import { DeviceRow } from "@/surfaces/Account/DevicesSheet/DeviceRow";

/** Props for the table: every session, the clock, and the sign-out callback. */
type Props = {
  sessions: readonly SessionDto[];
  now: Date;
  onSignOut: (device: SessionDto) => void;
};

/**
 * The narrowest this table is legible at: four columns, one of them a
 * button. Below it the table scrolls sideways inside its own box rather than
 * squashing, and the page itself never scrolls sideways.
 */
const TABLE_MIN_WIDTH = "30rem";

/**
 * The table itself: a real header row plus one `DeviceRow` per session.
 * Pulled out of `DevicesSheet` so the sheet reads as intro, table, banner,
 * modal, rather than the table's own markup showing through.
 *
 * `sessions` is never empty for a signed-in member: `GET /api/me/sessions`
 * answers with every live session, and the session making the request is
 * itself live, so it is always at least one row. There is deliberately no
 * empty state here for that reason.
 *
 * **The scroll container is the accessibility fix, not decoration.**
 * `design-spec.md` § Responsive behaviour says "the tables scroll rather than
 * reflow", and without this the four columns pushed the whole page 153px wide
 * at a 400px viewport, which `PRODUCT.md` § Accessibility & Inclusion does
 * not allow. The prototype has the same defect and is not the authority here.
 * `type="native"` rather than Mantine's default `ScrollArea`, because a
 * native scroller is the one that still works with a screen reader's own
 * cursor, and `tabIndex` makes it reachable by keyboard, which any region
 * that scrolls has to be. The region and the table carry the same name
 * deliberately: they are different roles, and a keyboard user who lands on
 * the scroller has to hear what it holds before they scroll it.
 *
 * **The `tabIndex` costs something too, and it is unconditional.** Mantine
 * applies it whether or not the content actually overflows, so on a wide
 * screen, where nothing scrolls, a keyboard user still meets a tab stop that
 * does nothing on the way to the sign-out buttons. That is the accepted
 * trade: the APG pattern asks for the stop, and a scrollable region that
 * cannot be reached from the keyboard at the width where it does scroll is
 * the worse of the two failures.
 */
export function DevicesTable({
  sessions,
  now,
  onSignOut,
}: Readonly<Props>): ReactNode {
  return (
    <Table.ScrollContainer
      minWidth={TABLE_MIN_WIDTH}
      type="native"
      tabIndex={0}
      role="region"
      aria-label="Where you are signed in"
    >
      <Table aria-label="Where you are signed in">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Device</Table.Th>
            <Table.Th>Last used</Table.Th>
            <Table.Th>Stays until</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sessions.map((session) => {
            return (
              <DeviceRow
                key={session.sessionId}
                session={session}
                now={now}
                onSignOut={onSignOut}
              />
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
