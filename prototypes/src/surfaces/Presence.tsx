import { Stack, Table } from "@mantine/core";
import { IconEye, IconLock } from "@tabler/icons-react";
import {
  ITEM_VIEWERS,
  MEMBER_PRESENCE,
  memberById,
  type MemberPresence,
} from "@/data/fixtures";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { ICON_PROPS } from "@/system/icons";
import { NEWBORN } from "@/data/media";
import { Print } from "@/system/Pile";
import { Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type PresenceState = "default" | "one-item" | "never-arrived";

/**
 * A count, in the day spine's numeral.
 *
 * Every figure on this surface is the same kind of fact as a day's count, so
 * it takes the same shape. A zero goes quiet rather than disappearing: it is
 * the answer to the question, not the absence of one.
 */
function Figure({ value }: { readonly value: number }) {
  return (
    <span
      className={
        value === 0
          ? `${classes.presenceFigure} ${classes.presenceFigureQuiet}`
          : classes.presenceFigure
      }
    >
      {value.toLocaleString("en-GB")}
    </span>
  );
}

function PresenceRow({ presence }: { readonly presence: MemberPresence }) {
  const member = memberById(presence.memberId);
  const absent = presence.lastSignedIn === null;

  return (
    <Table.Tr className={absent ? classes.presenceAbsent : undefined}>
      <Table.Td>
        <b>{member?.name ?? presence.memberId}</b>
        <br />
        <span className={classes.fileMeta}>{member?.email}</span>
      </Table.Td>
      <Table.Td className={classes.tabular}>
        {presence.lastSignedIn ?? "Never"}
      </Table.Td>
      <Table.Td>
        <Figure value={presence.daysActive} />
      </Table.Td>
      <Table.Td>
        <Figure value={presence.itemsOpened} />
      </Table.Td>
      <Table.Td>
        <Figure value={presence.commentsWritten} />
      </Table.Td>
      <Table.Td>
        <Figure value={presence.reactionsLeft} />
      </Table.Td>
    </Table.Tr>
  );
}

function PresenceSurface({ state }: { readonly state: PresenceState }) {
  const rows =
    state === "never-arrived"
      ? MEMBER_PRESENCE.filter((presence) => {
          return presence.lastSignedIn === null || presence.daysActive < 20;
        })
      : MEMBER_PRESENCE;

  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Lede>Who has been looking.</Lede>
          <Prose onPanel>
            Not analytics. Every figure here answers one question, which is
            whether somebody is here: who signs in, who opens things, who writes
            something back. It is the difference between an archive nine people
            share and a folder eight people have forgotten about.
          </Prose>

          {state === "one-item" ? (
            <Sheet wide label="Who has opened this photograph">
              <SheetHead title="Who has opened this one" />
              <Stack gap="md">
                <div className={classes.viewerPreview}>
                  <Print media={NEWBORN} seed={3} />
                  <div>
                    <Prose>
                      14 September, 6:41 am. Five of the seven people who can
                      see this have opened it; the other two have only had it go
                      past them in the pile.
                    </Prose>
                  </div>
                </div>
                <div>
                  {ITEM_VIEWERS.map((viewer) => {
                    const member = memberById(viewer.memberId);
                    return (
                      <div className={classes.viewerRow} key={viewer.memberId}>
                        <span className={classes.viewerName}>
                          {member?.name ?? viewer.memberId}
                        </span>
                        <span className={classes.viewerWhen}>
                          {viewer.opened === null
                            ? "Scrolled past, never opened"
                            : `${viewer.opened} · opened ${viewer.openCount}×`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Banner icon={<IconEye {...ICON_PROPS} />}>
                  <b>Only an admin sees this.</b> A member finding out that her
                  son has opened her photograph forty times, or has not opened
                  it at all, is a family argument the software should not start.
                </Banner>
              </Stack>
            </Sheet>
          ) : (
            <Sheet wide label="Every member">
              <SheetHead
                title={
                  state === "never-arrived"
                    ? "The quiet end of the list"
                    : "Everybody, most present first"
                }
              />
              <Stack gap="md">
                <Prose>
                  {state === "never-arrived"
                    ? "Sorted the same way, read from the bottom. Abuelo Tomás was invited three days ago and has not arrived; Tío Rafa signed in once in the spring. Both are worth a phone call rather than another email."
                    : "Days active counts days on which somebody did anything at all, out of the last ninety. Opened means opened at full size: scrolling past a thumbnail is not looking at a photograph."}
                </Prose>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Member</Table.Th>
                      <Table.Th>Last signed in</Table.Th>
                      <Table.Th>Days active</Table.Th>
                      <Table.Th>Opened</Table.Th>
                      <Table.Th>Comments</Table.Th>
                      <Table.Th>Reactions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((presence) => {
                      return (
                        <PresenceRow
                          key={presence.memberId}
                          presence={presence}
                        />
                      );
                    })}
                  </Table.Tbody>
                </Table>
                <Banner>
                  <b>Last signed in is not last seen.</b> A phone that is used
                  every day never asks for a code again, so Abuela Rosa last
                  typed six digits three weeks ago and has been here every day
                  since. The Members table shows the other one.
                </Banner>
              </Stack>
            </Sheet>
          )}

          <Sheet wide label="What is not recorded">
            <SheetHead title="What this does not record" />
            <Stack gap="md">
              <Prose>
                Said plainly, because a product whose whole pitch is privacy
                should be able to state what it refuses to collect without being
                asked.
              </Prose>
              <ul className={classes.plainList}>
                <li>No IP addresses, and no location. Not even a city.</li>
                <li>
                  How long somebody looked at something, how far they scrolled,
                  where they moved or tapped.
                </li>
                <li>
                  Where anybody stopped a video. A comment pinned to 0:14 is
                  something somebody chose to leave; watching them stop there
                  eleven times is not.
                </li>
                <li>What anybody searched or filtered for.</li>
                <li>
                  Whether somebody has read a comment. "She saw it and said
                  nothing" is a family argument, not a feature.
                </li>
              </ul>
              <Banner icon={<IconLock {...ICON_PROPS} />}>
                <b>These are absences in the database, not settings.</b> There
                is nothing to switch on later, because none of it is written
                down in the first place.
              </Banner>
            </Stack>
          </Sheet>
        </Stack>
      </main>
    </>
  );
}

export const presenceSurface: Surface = {
  id: "presence",
  number: 17,
  title: "Who has been looking",
  who: "admins",
  group: "admin",
  blurb:
    "Whether the people invited into this Shoebox are actually in it: who signs in, who opens things, who writes something back. And a plain statement of what is deliberately not recorded.",
  states: [
    {
      id: "default",
      label: "Everybody",
      note: "Ordered by who is most present rather than alphabetically, because the question is who cares and the answer should be the first row.",
      render: () => {
        return <PresenceSurface state="default" />;
      },
    },
    {
      id: "never-arrived",
      label: "The quiet end",
      note: "An invitation accepted and never used looks different from one never accepted, and both want a phone call rather than another email.",
      render: () => {
        return <PresenceSurface state="never-arrived" />;
      },
    },
    {
      id: "one-item",
      label: "Who opened this one",
      note: "The same data from the other direction, reached from a photograph. Opened at full size and scrolled past are different facts and are shown as different facts.",
      render: () => {
        return <PresenceSurface state="one-item" />;
      },
    },
  ],
};
