import { Button, Stack, Table } from "@mantine/core";
import { IconDeviceMobile } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import {
  daysLeftLabel,
  lastUsedLabel,
} from "@/surfaces/Account/deviceLabels/deviceLabels";
import { SignOutModal } from "@/surfaces/Account/SignOutModal";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

/** Props for one row: its session, the clock to label it from, and the callback. */
type DeviceRowProps = {
  session: SessionDto;
  now: Date;
  onSignOut: (device: SessionDto) => void;
};

/**
 * One device: its label (and "· this one" when it is the one you are on),
 * the two timestamps as labels, and the button that starts sign-out.
 */
function DeviceRow({
  session,
  now,
  onSignOut,
}: Readonly<DeviceRowProps>): ReactNode {
  return (
    <Table.Tr>
      <Table.Td>
        <b>{session.deviceLabel}</b>
        {session.isCurrent ? " · this one" : ""}
      </Table.Td>
      <Table.Td className={classes.tabular}>
        {lastUsedLabel({ lastUsedAt: session.lastUsedAt, now })}
      </Table.Td>
      <Table.Td className={classes.tabular}>
        {daysLeftLabel({ expiresAt: session.expiresAt, now })}
      </Table.Td>
      <Table.Td>
        <Button
          variant={session.isCurrent ? "danger" : "default"}
          size="sm"
          aria-label={
            session.isCurrent
              ? "Sign out here"
              : `Sign out ${session.deviceLabel}`
          }
          onClick={() => {
            onSignOut(session);
          }}
        >
          {session.isCurrent ? "Sign out here" : "Sign out"}
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

/** Props for the table: every session, the clock, and the sign-out callback. */
type DevicesTableProps = {
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
 */
function DevicesTable({
  sessions,
  now,
  onSignOut,
}: Readonly<DevicesTableProps>): ReactNode {
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

/**
 * Props for the devices sheet: every session as you, the clock to label them
 * from, and which one (if any) is mid-confirmation.
 *
 * Neither `sessions` nor `now` is fetched or read here: both come from the
 * assembly (Task 10), matching `EmailSheet` and `YouSheet`. `deviceSigningOut`
 * is likewise the caller's own state, not owned by this sheet, so the same
 * device stays named across a render even while the sign-out mutation is in
 * flight.
 */
type Props = {
  sessions: readonly SessionDto[];
  now: Date;
  onSignOut: (device: SessionDto) => void;
  deviceSigningOut: SessionDto | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  isSigningOut: boolean;
};

/**
 * Every device currently signed in as you, and the confirmation before one
 * stops working.
 *
 * A device row is a label and two timestamps: `SessionDto` deliberately
 * carries no IP address, no location, and no raw user agent, so none of
 * those appear here either.
 */
export function DevicesSheet({
  sessions,
  now,
  onSignOut,
  deviceSigningOut,
  onConfirm,
  onCancel,
  isSigningOut,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="Your devices">
      <SheetHead title="Where you are signed in" />
      <Stack gap="md">
        <Prose>
          Each of these stays signed in for 30 days and the clock resets every
          time you use it. A phone you have not opened in a month falls out on
          its own and needs a fresh code.
        </Prose>
        <DevicesTable sessions={sessions} now={now} onSignOut={onSignOut} />
        <Banner icon={<IconDeviceMobile {...ICON_PROPS} />}>
          <b>Lost a phone, or handed one on?</b> Sign it out here and it stops
          working immediately, wherever it is.
        </Banner>
      </Stack>
      <SignOutModal
        device={deviceSigningOut}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isSigningOut={isSigningOut}
      />
    </Sheet>
  );
}
