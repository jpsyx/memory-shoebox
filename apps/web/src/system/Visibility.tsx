import { Box, SegmentedControl, Stack } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { Banner } from "@/system/Chrome";
import {
  PeopleField,
  type PeopleFieldGroup,
  type PeopleFieldMember,
} from "@/system/PeopleField";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Prose } from "@/system/typography";
import type { ReactNode } from "react";

export type VisibilityMode = "everyone" | "only" | "except";

type Props = {
  readonly mode: VisibilityMode;
  readonly onModeChange: (nextMode: VisibilityMode) => void;
  readonly subjects: readonly string[];
  readonly onSubjectsChange: (nextSubjects: readonly string[]) => void;
  readonly members: readonly PeopleFieldMember[];
  readonly groups: readonly PeopleFieldGroup[];
  readonly heading?: string;
};

const MODE_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "only", label: "Only" },
  { value: "except", label: "Except" },
];

const MODE_PROSE: Record<VisibilityMode, string> = {
  everyone:
    "Everybody in your Shoebox. This is the default, and it is the one you can walk past.",
  only: "Nobody but the people and groups you name. To everybody else these simply are not there, and are not counted.",
  except:
    "Everybody except the people and groups you name. To them these simply are not there, and are not counted.",
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
}: Props): ReactNode {
  return (
    <Stack gap="sm">
      <LabelText component="h3">{heading}</LabelText>
      <Box>
        <SegmentedControl
          value={mode}
          onChange={(next) => {
            return onModeChange(next as VisibilityMode);
          }}
          data={MODE_OPTIONS}
          aria-label={heading}
        />
      </Box>

      <Prose>{MODE_PROSE[mode]}</Prose>

      {mode === "everyone" ? null : (
        <Stack gap="sm">
          <PeopleField
            label={mode === "only" ? "Only these" : "Everybody except these"}
            description="Start typing. Groups come first, because naming one is shorter than naming nine people."
            placeholder="The grandparents, Abuela Rosa"
            value={subjects}
            onChange={onSubjectsChange}
            mode="members-and-groups"
            members={members}
            groups={groups}
          />
          <Prose>
            Groups are worked out when somebody looks, not now. Add a cousin to{" "}
            <b>Cousins</b> next year and they get everything the group could
            already see.
          </Prose>
        </Stack>
      )}

      <Banner icon={<IconEye {...ICON_PROPS} />}>
        <b>An admin sees every item, always.</b> Whoever runs this archive can
        open anything in it, and nothing here changes that.
      </Banner>
    </Stack>
  );
}
