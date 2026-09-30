import { Button, Stack } from "@mantine/core";
import { IconEyeOff, IconUpload, IconUsers } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { MemberRole } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS } from "@/system/icons";
import { Archive } from "@/system/Pile/Archive";
import { DayRow } from "@/system/Pile/DayRow";
import { Ghosts } from "@/system/Pile/Ghosts";
import { LabelText } from "@/system/typography/LabelText";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  /** The viewer's own role, which is the only thing that tells these apart. */
  role: MemberRole;
};

/** The fake spine above the copy: a footprint, never a counted real day. */
function _emptySpine(unitLabel: string): ReactNode {
  return (
    <div className={classes.spine}>
      <p className={classes.spineFigure}>0</p>
      <LabelText className={classes.spineMonth}>{unitLabel}</LabelText>
      <p className={classes.spineCount}>
        0 <span className={classes.spineCountLabel}>days</span>
      </p>
    </div>
  );
}

/**
 * The admin and uploader body: an invitation to put the first things up.
 *
 * A real anchor wearing a button's clothes, exactly as
 * `system/ProductBar/BarLink.tsx` and `AdminDoors/AdminDoor.tsx` already do:
 * Mantine's `component={Link}` collapses `Link`'s generics before `to`
 * narrows them, so a route that does not exist stops being a compile error.
 * Calling `Link` directly keeps `to` literal, and `classes.barLink` is the
 * reset that takes the browser's blue and underline off it.
 */
function _canUploadBody(): ReactNode {
  return (
    <Stack gap="md">
      <Lede>Nothing on the door yet.</Lede>
      <Prose onPanel>
        Put it all up. Not the best six, the whole lot: the blurry ones, the
        twelve nearly identical ones, the videos, whatever is on the phone from
        whichever week. Sorting through them is the job this is meant to save
        you, and the people you invite can do their own looking.
      </Prose>
      <ChipRow>
        <Link to="/upload" className={classes.barLink}>
          <Button component="span" leftSection={<IconUpload {...ICON_PROPS} />}>
            Upload media
          </Button>
        </Link>
        <Link to="/members" className={classes.barLink}>
          <Button
            component="span"
            variant="panel"
            leftSection={<IconUsers {...ICON_PROPS} />}
          >
            Invite people
          </Button>
        </Link>
      </ChipRow>
    </Stack>
  );
}

/**
 * The viewer body: nothing shared, and nobody named.
 *
 * The member list is not available here and must not be: this is not an
 * admin route, so there is no name to put in the sentence. It names nobody,
 * and it is prose rather than a control, because there is nothing in the
 * product for such a control to do yet.
 */
function _restrictedBody(): ReactNode {
  return (
    <Stack gap="md">
      <Lede>Nothing here for you yet.</Lede>
      <Prose onPanel>
        There is an archive behind this, and right now none of it is shared with
        you. Whoever put it up decides that photograph by photograph, and it can
        change at any time without anybody having to ask you again. Ask whoever
        invited you about it.
      </Prose>
      <Banner onPanel icon={<IconEyeOff {...ICON_PROPS} />}>
        This page looks exactly the same on a brand new archive with nothing in
        it. That is on purpose: a count of what you cannot see would tell you
        something about it.
      </Banner>
    </Stack>
  );
}

/**
 * Surface 5, both states, drawn from one component.
 *
 * **The payload cannot tell these apart, and that is a contract.** A
 * brand-new archive and a viewer restricted from everything return
 * byte-identical bodies from `GET /api/timeline`, and no field may be added
 * that distinguishes them (`timeline.md` transformation 9). The copy is
 * therefore chosen here, from the viewer's own role, which the shell already
 * has.
 *
 * A viewer looking at a genuinely empty archive reads the restricted copy.
 * That is not a defect: it is the indistinguishability the contract asks
 * for, seen from the one side that cannot tell.
 */
export function EmptyArchive({ role }: Readonly<Props>): ReactNode {
  const canPutThingsUp = role === "admin" || role === "uploader";

  return (
    <Archive>
      <DayRow>
        {_emptySpine(canPutThingsUp ? "Photos" : "Visible")}
        <div>
          {canPutThingsUp ? _canUploadBody() : _restrictedBody()}
          <Ghosts />
        </div>
      </DayRow>
    </Archive>
  );
}
