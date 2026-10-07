import { Box, SegmentedControl, Stack } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { Banner } from "@/system/Chrome/Banner";
import {
  PeopleField,
  type PeopleFieldGroup,
  type PeopleFieldMember,
} from "@/system/PeopleField/PeopleField";
import { ICON_PROPS } from "@/system/icons";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type { ReactNode } from "react";

const MODE_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "only", label: "Only" },
  { value: "except", label: "Except" },
] as const;

export type VisibilityMode = (typeof MODE_OPTIONS)[number]["value"];

function _isVisibilityMode(value: string): value is VisibilityMode {
  return MODE_OPTIONS.some((option) => {
    return option.value === value;
  });
}

type Props = {
  mode: VisibilityMode;
  onModeChange: (nextMode: VisibilityMode) => void;
  subjects: readonly string[];
  onSubjectsChange: (nextSubjects: readonly string[]) => void;
  members: readonly PeopleFieldMember[];
  groups: readonly PeopleFieldGroup[];
  heading?: string;
};

const MODE_PROSE: Record<VisibilityMode, string> = {
  everyone: "Everybody in your Shoebox.",
  only: "Only the people and groups you choose, plus admins.",
  except:
    "Everybody except the people and groups you choose. Admins always have access.",
};

/**
 * The visibility control.
 *
 * Per item, defaulting to everyone, and phrased so it reads as a step you
 * skip rather than a decision you make. Groups and members sit in one list
 * with groups first, because naming a group is the shorter path and putting
 * it second buries it under nine names.
 *
 * The admin sentence underneath is not a disclaimer. An uploader who believes
 * they have hidden something from the person who runs the archive has been
 * misled by the interface, so it is stated wherever visibility is set.
 */
export function VisibilityControl({
  mode,
  onModeChange,
  subjects,
  onSubjectsChange,
  members,
  groups,
  heading = "Who can see these",
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="sm">
      <LabelText component="h3">{heading}</LabelText>
      <Box>
        <SegmentedControl
          value={mode}
          onChange={(nextMode) => {
            return onModeChange(_isVisibilityMode(nextMode) ? nextMode : mode);
          }}
          data={[...MODE_OPTIONS]}
          aria-label={heading}
        />
      </Box>

      <Prose>{MODE_PROSE[mode]}</Prose>

      {mode === "everyone" ? null : (
        <Stack gap="sm">
          <PeopleField
            label={mode === "only" ? "Only these" : "Everybody except these"}
            placeholder="The grandparents, Abuela Rosa"
            value={subjects}
            onChange={onSubjectsChange}
            mode="members-and-groups"
            members={members}
            groups={groups}
          />
          <Prose>Access updates when group membership changes.</Prose>
        </Stack>
      )}

      <Banner icon={<IconEye {...ICON_PROPS} />}>
        <b>An admin sees every item, always.</b>
      </Banner>
    </Stack>
  );
}
