import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import { DevicesTable } from "@/surfaces/Account/DevicesSheet/DevicesTable/DevicesTable";
import { Prose } from "@/system/typography/Prose";

/** Props for the middle of the sheet: the list, or what stands in for it. */
type Props = {
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
export function DevicesBody({
  sessions,
  now,
  onSignOut,
  hasFailed,
}: Readonly<Props>): ReactNode {
  if (sessions !== undefined) {
    return <DevicesTable sessions={sessions} now={now} onSignOut={onSignOut} />;
  }
  return hasFailed ? null : (
    <Prose>The devices you are signed in on are on their way.</Prose>
  );
}
