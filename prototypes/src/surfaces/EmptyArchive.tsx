import { Button, Stack } from "@mantine/core";
import { IconEyeOff, IconUpload, IconUsers } from "@tabler/icons-react";
import { SHOEBOX_NAME } from "@/data/fixtures";
import { Banner, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { Ghosts } from "@/system/Pile";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type EmptyState = "new" | "restricted";

/**
 * The honest test of this world: no photographs at all. The spine, the
 * figures and the panel carry the page, with no card, no drop shadow and no
 * illustration, so what is recognisable here is the world itself.
 */
function EmptySurface({ state }: { readonly state: EmptyState }) {
  const isNew = state === "new";

  return (
    <>
      <TopBar
        title={SHOEBOX_NAME}
        detail={isNew ? "1 person · you" : "9 people"}
      />
      <main className={classes.archive}>
        <section className={classes.day}>
          <div className={classes.spine}>
            <p className={classes.spineFigure}>0</p>
            <LabelText className={classes.spineMonth}>
              {isNew ? "Photos" : "Visible"}
            </LabelText>
            <p className={classes.spineCount}>
              0 <span className={classes.spineCountLabel}>days</span>
            </p>
          </div>

          <div>
            {isNew ? (
              <Stack gap="md">
                <Lede>Nothing on the door yet.</Lede>
                <Prose onPanel>
                  Put it all up. Not the best six, the whole lot: the blurry
                  ones, the twelve nearly identical ones, the videos, whatever
                  is on the phone from whichever week. Sorting through them is
                  the job this is meant to save you, and the people you invite
                  can do their own looking.
                </Prose>
                <ChipRow>
                  <Button leftSection={<IconUpload {...ICON_PROPS} />}>
                    Upload media
                  </Button>
                  <Button
                    variant="panel"
                    leftSection={<IconUsers {...ICON_PROPS} />}
                  >
                    Invite people
                  </Button>
                </ChipRow>
              </Stack>
            ) : (
              <Stack gap="md">
                <Lede>Nothing here for you yet.</Lede>
                <Prose onPanel>
                  There is an archive behind this, and right now none of it is
                  shared with you. Whoever put it up decides that photograph by
                  photograph, and it can change at any time without anybody
                  having to ask you again.
                </Prose>
                <Banner onPanel icon={<IconEyeOff {...ICON_PROPS} />}>
                  This page looks exactly the same on a brand new archive with
                  nothing in it. That is on purpose: a count of what you cannot
                  see would tell you something about it.
                </Banner>
                <ChipRow>
                  <Button variant="panel">Ask Papá about it</Button>
                </ChipRow>
              </Stack>
            )}

            <Ghosts />
          </div>
        </section>
      </main>
    </>
  );
}

export const emptySurface: Surface = {
  id: "empty",
  number: 5,
  title: "Empty archive",
  who: "every member",
  group: "member",
  blurb:
    "The same world with every photograph removed. It has to be recognisable with nothing in it, and it has to read the same whether the archive is new or simply closed to you.",
  states: [
    {
      id: "new",
      label: "A brand new archive",
      note: "The pile's own footprint drawn as ghost frames rather than described in a sentence. No card, no shadow, no illustration.",
      render: () => {
        return <EmptySurface state="new" />;
      },
    },
    {
      id: "restricted",
      label: "A viewer who can see nothing",
      note: "Deliberately identical in shape to a new archive. A count of what is hidden from you would leak the thing it is hiding.",
      render: () => {
        return <EmptySurface state="restricted" />;
      },
    },
  ],
};
