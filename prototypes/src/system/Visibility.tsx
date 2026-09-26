import { Box, Checkbox, SegmentedControl, Stack } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { GROUPS, MEMBERS } from "@/data/fixtures";
import { Banner } from "@/system/Chrome";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Prose } from "@/system/typography";
import type { ReactNode } from "react";

export type VisibilityMode = "everyone" | "only" | "except";

const MODE_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "only", label: "Only" },
  { value: "except", label: "Except" },
];

const MODE_PROSE: Record<VisibilityMode, string> = {
  everyone:
    "Everybody in your Shoebox. This is the default, and it is the one you can walk past.",
  only: "Nobody but the people and groups you tick. To everybody else these simply are not there, and are not counted.",
  except:
    "Everybody except the people and groups you tick. To them these simply are not there, and are not counted.",
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
  heading = "Who can see these",
}: {
  readonly mode: VisibilityMode;
  readonly onModeChange: (next: VisibilityMode) => void;
  readonly subjects: readonly string[];
  readonly onSubjectsChange: (next: readonly string[]) => void;
  readonly heading?: string;
}): ReactNode {
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
          <Checkbox.Group
            value={[...subjects]}
            onChange={onSubjectsChange}
            aria-label="People and groups"
          >
            <Stack gap="sm">
              <LabelText>Groups</LabelText>
              {GROUPS.map((group) => {
                return (
                  <Checkbox
                    key={group.id}
                    value={group.id}
                    label={`${group.name} (${group.memberIds.length})`}
                  />
                );
              })}
              <LabelText>People</LabelText>
              {MEMBERS.filter((member) => {
                return member.status === "active";
              }).map((member) => {
                return (
                  <Checkbox
                    key={member.id}
                    value={member.id}
                    label={member.name}
                  />
                );
              })}
            </Stack>
          </Checkbox.Group>
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

/** How a visibility rule reads once it is set, in one line. */
export function describeVisibility(
  mode: VisibilityMode,
  subjects: readonly string[],
): string {
  if (mode === "everyone") {
    return "Everyone";
  }
  const names = subjects.map((id) => {
    const group = GROUPS.find((candidate) => {
      return candidate.id === id;
    });
    if (group) {
      return group.name;
    }
    return (
      MEMBERS.find((candidate) => {
        return candidate.id === id;
      })?.name ?? id
    );
  });
  if (names.length === 0) {
    return mode === "only" ? "Nobody yet" : "Everyone";
  }
  return `${mode === "only" ? "Only" : "Everyone except"} ${names.join(", ")}`;
}
