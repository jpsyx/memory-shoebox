import { Button, Stack, Textarea } from "@mantine/core";
import { IconClock, IconFlag, IconTrash } from "@tabler/icons-react";
import { NEWBORN } from "@/data/media";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type RemovalState = "ask" | "already" | "uploader" | "admin" | "declined";

/** The item in question, small. Nobody needs it full size to agree it goes. */
function TheItem({ caption }: { readonly caption: string }) {
  return (
    <Stack gap="sm">
      <span className={classes.itemThumb}>
        <img src={NEWBORN.thumb} alt={NEWBORN.alt} />
      </span>
      <span className={classes.fileMeta}>{caption}</span>
    </Stack>
  );
}

function RemovalSurface({ state }: { readonly state: RemovalState }) {
  return (
    <>
      <TopBar back="Back to the photo" />
      <main className={classes.page}>
        <Stack gap="lg">
          {state === "ask" ? (
            <>
              <Lede>Ask for this one to come down.</Lede>
              <Prose onPanel>
                You are tagged in it. Asking sends a note to Papá, who put it
                up, and to everyone who runs this archive. Nothing happens to
                the photograph until one of them acts.
              </Prose>
              <Sheet wide label="The request">
                <Stack gap="md">
                  <TheItem caption="14 September 2026, 6:41 am · uploaded by Papá" />
                  <Textarea
                    label="Why, if you want to say"
                    description="Optional. It only goes to Papá and the admins, never to the rest of the circle."
                    placeholder="I am mid-sentence and it is not a good one."
                  />
                  <ChipRow>
                    <Button leftSection={<IconFlag {...ICON_PROPS} />}>
                      Send the request
                    </Button>
                    <Button variant="default">Never mind</Button>
                  </ChipRow>
                  <Prose>
                    This is a normal thing to ask in a family, which is why it
                    has a button rather than being an awkward text message.
                  </Prose>
                </Stack>
              </Sheet>
            </>
          ) : null}

          {state === "already" ? (
            <>
              <Lede>You have already asked about this one.</Lede>
              <Sheet wide label="Your request">
                <Stack gap="md">
                  <TheItem caption="Asked 2 days ago · nobody has acted yet" />
                  <Banner icon={<IconClock {...ICON_PROPS} />}>
                    <b>Papá and two admins were told.</b> Until one of them
                    acts, the photograph stays where it is, and everybody who
                    could already see it still can.
                  </Banner>
                  <div>
                    <LabelText component="h3">What you said</LabelText>
                    <Prose>
                      I am mid-sentence and it is not a good one. Sorry to be a
                      bother.
                    </Prose>
                  </div>
                  <ChipRow>
                    <Button variant="default">Withdraw the request</Button>
                  </ChipRow>
                </Stack>
              </Sheet>
            </>
          ) : null}

          {state === "uploader" || state === "admin" ? (
            <>
              <Lede>
                {state === "uploader"
                  ? "Inés has asked you to take one down."
                  : "Inés has asked for one to come down."}
              </Lede>
              <Sheet wide label="The request">
                <SheetHead title="Asked 2 days ago" />
                <Stack gap="md">
                  <TheItem
                    caption={
                      state === "uploader"
                        ? "You put this up on 14 September 2026"
                        : "Put up by Papá on 14 September 2026"
                    }
                  />
                  <div>
                    <LabelText component="h3">What Inés said</LabelText>
                    <Prose>
                      I am mid-sentence and it is not a good one. Sorry to be a
                      bother.
                    </Prose>
                  </div>
                  <Banner>
                    <b>Deleting is final.</b> The record and the file both go,
                    along with anything written on it. There is no hidden flag
                    and nothing to restore.
                  </Banner>
                  <ChipRow>
                    <Button
                      variant="danger"
                      leftSection={<IconTrash {...ICON_PROPS} />}
                    >
                      Delete it
                    </Button>
                    <Button variant="default">
                      Keep it, and tell Inés why
                    </Button>
                  </ChipRow>
                  {state === "admin" ? (
                    <Prose>
                      You are seeing this because you run the archive. Papá, who
                      put it up, was asked at the same time and can act first.
                    </Prose>
                  ) : null}
                </Stack>
              </Sheet>
            </>
          ) : null}

          {state === "declined" ? (
            <>
              <Lede>Papá is keeping that one.</Lede>
              <Sheet wide label="What happened">
                <Stack gap="md">
                  <TheItem caption="You asked 5 weeks ago · Papá answered" />
                  <div>
                    <LabelText component="h3">What Papá said</LabelText>
                    <Prose>
                      It is the only one with all four of you in it. Keeping it,
                      but it is off the front of the day now.
                    </Prose>
                  </div>
                  <Banner>
                    <b>A declined request is answered, not ignored.</b> The
                    person who asked always hears back in words, because silence
                    here turns into a phone call.
                  </Banner>
                  <ChipRow>
                    <Button variant="default">Ask again</Button>
                  </ChipRow>
                </Stack>
              </Sheet>
            </>
          ) : null}
        </Stack>
      </main>
    </>
  );
}

export const removalSurface: Surface = {
  id: "removal",
  number: 10,
  title: "Request removal",
  who: "every member",
  group: "member",
  blurb:
    "Please take that one down is a normal and frequent request in a family, and it deserves a path rather than an awkward text message.",
  states: [
    {
      id: "ask",
      label: "Asking",
      note: "The reason is optional and its audience is stated. Making it compulsory would stop people asking at all.",
      render: () => {
        return <RemovalSurface state="ask" />;
      },
    },
    {
      id: "already",
      label: "Already asked",
      note: "Says plainly that nothing has changed yet, so nobody assumes the photograph came down when it did not.",
      render: () => {
        return <RemovalSurface state="already" />;
      },
    },
    {
      id: "uploader",
      label: "The uploader's view",
      note: "Two buttons and no third option: delete it, or keep it and say why. Nothing can be left silently open.",
      render: () => {
        return <RemovalSurface state="uploader" />;
      },
    },
    {
      id: "admin",
      label: "An admin's view",
      note: "The same screen, plus the fact that the uploader was asked too and may act first.",
      render: () => {
        return <RemovalSurface state="admin" />;
      },
    },
    {
      id: "declined",
      label: "What the requester is told",
      note: "Answered in words by the person who declined. Silence here becomes a phone call.",
      render: () => {
        return <RemovalSurface state="declined" />;
      },
    },
  ],
};
