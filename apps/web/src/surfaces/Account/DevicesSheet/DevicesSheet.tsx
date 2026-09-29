import { Stack } from "@mantine/core";
import { IconDeviceMobile } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import { DevicesBody } from "@/surfaces/Account/DevicesSheet/DevicesBody";
import { DevicesFailure } from "@/surfaces/Account/DevicesSheet/DevicesFailure";
import { SignOutModal } from "@/surfaces/Account/SignOutModal";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";

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
 * that failed rather than a section that silently is not there. Which of the
 * three is drawn is `DevicesBody`'s decision, and the sentence and button
 * that go with a failure are `DevicesFailure`'s.
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
