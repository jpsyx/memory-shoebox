import { Button, SegmentedControl, Stack, TextInput } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useState } from "react";
import { INSTANCE_TITLE } from "@/data/fixtures";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { Ghosts, Print } from "@/system/Pile";
import { pickVariedFrame } from "@/data/media";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type SettingsState = "default" | "renaming" | "tidy" | "mail-failing";

/** A miniature of the wall, so the arrangement is chosen by looking at it. */
function ArrangementPreview() {
  return (
    <div className={classes.pile}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
        return (
          <Print key={index} media={pickVariedFrame(index)} seed={index} />
        );
      })}
    </div>
  );
}

function SettingsSurface({ state }: { readonly state: SettingsState }) {
  const [title, setTitle] = useState(
    state === "renaming" ? "The Sarmiento shoebox" : INSTANCE_TITLE,
  );
  const [pile, setPile] = useState(state === "tidy" ? "tidy" : "messy");

  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.page}>
        <Stack gap="lg">
          <Lede>Settings for this archive.</Lede>
          <Prose onPanel>
            These belong to the deployment rather than to a person. Whatever is
            chosen here is what everybody in the circle sees.
          </Prose>

          {state === "mail-failing" ? (
            <Banner onPanel icon={<IconAlertCircle {...ICON_PROPS} />}>
              <b>Mail has not gone out for 3 hours.</b> Resend is refusing the
              sending address: the domain <b>example.com</b> is not verified.
              Nobody new can sign in until this is fixed, although everybody
              already signed in is unaffected. Last error: 403, domain not
              verified.
            </Banner>
          ) : null}

          <Sheet wide label="What this archive is called">
            <SheetHead title="What this is called" />
            <Stack gap="md">
              <TextInput
                label="Instance title"
                description="Shown in the top bar, in every email, and on the sign-in page."
                value={title}
                onChange={(event) => {
                  return setTitle(event.currentTarget.value);
                }}
              />
              <Prose>
                Members see this, not the software's name. It is their family's
                archive, not a product they signed up to.
              </Prose>
              {state === "renaming" ? (
                <ChipRow>
                  <Button>Save the new name</Button>
                  <Button variant="default">Cancel</Button>
                </ChipRow>
              ) : null}
            </Stack>
          </Sheet>

          <Sheet wide label="How the pile is arranged">
            <SheetHead title="How the pile is arranged" />
            <Stack gap="md">
              <SegmentedControl
                value={pile}
                onChange={setPile}
                data={[
                  { value: "tidy", label: "Tidy" },
                  { value: "messy", label: "Messy" },
                ]}
                aria-label="Pile arrangement"
              />
              <Prose>
                {pile === "messy"
                  ? "Nobody straightens a fridge door. Prints go up crooked and overlapping, at angles seeded from their position so the wall is the same on every visit."
                  : "Prints sit square. Still no cropping and still no grid of squares: every photograph keeps the height its own proportions need."}
              </Prose>
              <ArrangementPreview />
              <Banner>
                <b>One wall for everybody.</b> This is not a comfort setting
                each member adjusts for themselves. The arrangement is part of
                what the place looks like, so it is chosen once, here.
              </Banner>
            </Stack>
          </Sheet>

          <Sheet wide label="Where the mail comes from">
            <SheetHead title="Where mail comes from" />
            <Stack gap="md">
              <TextInput
                label="Sending address"
                description="Resend needs this domain verified before it will send anything."
                defaultValue="shoebox@example.com"
                error={
                  state === "mail-failing" ? (
                    <>
                      <IconAlertCircle {...ICON_PROPS} />
                      example.com is not verified with Resend. Add the DNS
                      records Resend gives you, then check again.
                    </>
                  ) : undefined
                }
              />
              <ChipRow>
                <Button variant="default">Send myself a test</Button>
                {state === "mail-failing" ? (
                  <Button>Check verification again</Button>
                ) : null}
              </ChipRow>
              <Banner>
                <b>This is the one dependency that locks everybody out.</b>{" "}
                Sign-in codes go by email, so if mail stops, nobody new can get
                in, including you. Sessions already signed in keep working for
                their 30 days, which is what buys the time to fix it.
              </Banner>
            </Stack>
          </Sheet>

          <Sheet wide label="Storage">
            <SheetHead title="Where the files live" />
            <Stack gap="sm">
              <LabelText component="h3">Backblaze B2</LabelText>
              <Prose>
                2,147 files, 61.4 GB, in a bucket you own. Memory Shoebox
                indexes them; it does not own them. If this software disappeared
                tomorrow the files would still be sitting there.
              </Prose>
              {state === "default" ? null : <Ghosts />}
            </Stack>
          </Sheet>
        </Stack>
      </main>
    </>
  );
}

export const settingsSurface: Surface = {
  id: "settings",
  number: 11,
  title: "Settings",
  who: "admins",
  group: "admin",
  blurb:
    "The instance title and the pile arrangement, both deployment-wide rather than per person, plus the mail dependency that can lock everybody out.",
  states: [
    {
      id: "default",
      label: "Default",
      note: "Four things, each with the reason it is a deployment choice rather than a personal one written beside it.",
      render: () => {
        return <SettingsSurface state="default" />;
      },
    },
    {
      id: "renaming",
      label: "Renaming the archive",
      note: "The title is what members actually see. The software's own name barely appears inside a running instance.",
      render: () => {
        return <SettingsSurface state="renaming" />;
      },
    },
    {
      id: "tidy",
      label: "Tidy pile chosen",
      note: "Chosen by looking at a live miniature of the wall rather than from two words in a dropdown.",
      render: () => {
        return <SettingsSurface state="tidy" />;
      },
    },
    {
      id: "mail-failing",
      label: "Mail is failing",
      note: "The diagnostic an admin can act on, with the provider's own error. A grandmother typing her address sees nothing of this.",
      render: () => {
        return <SettingsSurface state="mail-failing" />;
      },
    },
  ],
};
