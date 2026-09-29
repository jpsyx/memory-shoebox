import { Button, Stack, Table } from "@mantine/core";
import { IconDeviceMobile } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import {
  daysLeftLabel,
  lastUsedLabel,
} from "@/surfaces/Account/deviceLabels/deviceLabels";
import { SignOutModal } from "@/surfaces/Account/SignOutModal";
import { ChipRow } from "@/system/Chip/ChipRow";
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
 *
 * **The `tabIndex` costs something too, and it is unconditional.** Mantine
 * applies it whether or not the content actually overflows, so on a wide
 * screen, where nothing scrolls, a keyboard user still meets a tab stop that
 * does nothing on the way to the sign-out buttons. That is the accepted
 * trade: the APG pattern asks for the stop, and a scrollable region that
 * cannot be reached from the keyboard at the width where it does scroll is
 * the worse of the two failures.
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

/** Props for the middle of the sheet: the list, or what stands in for it. */
type DevicesBodyProps = {
  sessions: readonly SessionDto[] | undefined;
  now: Date;
  onSignOut: (device: SessionDto) => void;
  hasFailed: boolean;
};

/**
 * Whatever belongs where the table goes: the table, a line saying the list is
 * coming, or nothing at all.
 *
 * Three states rather than two, because a list that failed to load and a list
 * that has not arrived yet look identical if only their absence is rendered,
 * and the failed one is the one somebody has to be told about. The failed
 * case renders nothing here because the sentence and the button that go with
 * it are rendered below, together, which is the order they are read in.
 */
function DevicesBody({
  sessions,
  now,
  onSignOut,
  hasFailed,
}: Readonly<DevicesBodyProps>): ReactNode {
  if (sessions !== undefined) {
    return <DevicesTable sessions={sessions} now={now} onSignOut={onSignOut} />;
  }
  return hasFailed ? null : (
    <Prose>The devices you are signed in on are on their way.</Prose>
  );
}

/** Props for the failure line, and the one way out of it there is. */
type DevicesFailureProps = {
  error: string | undefined;
  onRetry: (() => void) | undefined;
};

/**
 * Whatever has just failed, and the thing to do about it, in the order they
 * are read: the sentence first, then the button.
 *
 * The two are separate props rather than one, because they do not always
 * arrive together: a sign-out that failed has a sentence and nothing to
 * retry, since the button that started it is still sitting in its row.
 */
function DevicesFailure({
  error,
  onRetry,
}: Readonly<DevicesFailureProps>): ReactNode {
  return (
    <>
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
      {onRetry === undefined ? null : (
        <ChipRow>
          <Button variant="default" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </ChipRow>
      )}
    </>
  );
}

/**
 * Props for the devices sheet: every session as you, the clock to label them
 * from, which one (if any) is mid-confirmation, and whatever has just gone
 * wrong.
 *
 * Nothing here is fetched or read in this file: all of it comes from the
 * assembly (Task 10), matching `EmailSheet` and `YouSheet`. `deviceSigningOut`
 * is likewise the caller's own state, not owned by this sheet, so the same
 * device stays named across a render even while the sign-out mutation is in
 * flight.
 *
 * `error` matches the prop `YouSheet` and `EmailSheet` already take, so that
 * every failure on this surface is shown inside the card it belongs to rather
 * than loose on the page behind it: one pattern, one place to look.
 */
type Props = {
  /** The live devices, or undefined while the list is still on its way. */
  sessions: readonly SessionDto[] | undefined;
  now: Date;
  onSignOut: (device: SessionDto) => void;
  deviceSigningOut: SessionDto | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  isSigningOut: boolean;
  /** Whatever has just failed, as the sentence to show inside this card. */
  error: string | undefined;
  /** Fetching the list again, offered only when it is the list that failed. */
  onRetry: (() => void) | undefined;
};

/**
 * Every device currently signed in as you, and the confirmation before one
 * stops working.
 *
 * A device row is a label and two timestamps: `SessionDto` deliberately
 * carries no IP address, no location, and no raw user agent, so none of
 * those appear here either.
 *
 * The sheet is on screen in all three of its states, loading, failed and
 * loaded, so that the surface does not change shape underneath somebody
 * while the list arrives, and so that a list that failed is visibly a list
 * that failed rather than a section that silently is not there.
 */
export function DevicesSheet({
  sessions,
  now,
  onSignOut,
  deviceSigningOut,
  onConfirm,
  onCancel,
  isSigningOut,
  error,
  onRetry,
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
        <DevicesBody
          sessions={sessions}
          now={now}
          onSignOut={onSignOut}
          hasFailed={error !== undefined}
        />
        <DevicesFailure error={error} onRetry={onRetry} />
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
