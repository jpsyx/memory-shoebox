import { Button, Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  setUploadVisibilityRequestSchema,
  type SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import { membersQueryOptions } from "@/api/members/members";
import { groupsQueryOptions } from "@/api/groups/groups";
import { Sheet } from "@/system/Chrome/Sheet";
import { Banner } from "@/system/Chrome/Banner";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Stat } from "@/system/typography/Stat";
import { Prose } from "@/system/typography/Prose";
import type {
  PeopleFieldMember,
  PeopleFieldGroup,
} from "@/system/PeopleField/PeopleField";
import { VisibilityControl } from "@/system/VisibilityControl/VisibilityControl";
import { UploadDayGroup } from "../UploadDayGroup/UploadDayGroup";
import { UploadLabelModal } from "../UploadLabelModal/UploadLabelModal";
import { UploadSelectionBar } from "./UploadSelectionBar";
import { UploadEdits } from "./UploadEdits";
import { UploadUndated } from "./UploadUndated";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import classes from "@/system/system.module.css";
import previewClasses from "../upload.module.css";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  visibility: SetUploadVisibilityRequest;
  onVisibilityChange: (visibility: SetUploadVisibilityRequest) => void;
  onStart: () => void;
  onOpenMilestone: () => void;
};
function _draftOverview(snapshot: Readonly<UploadSnapshot>): ReactNode {
  const detail = snapshot.detail!;
  return (
    <Sheet wide label="What is going up">
      <Stack gap="md">
        <div className={classes.uploadFigureRow}>
          <Stat
            figure={detail.fileCount.toLocaleString("en-GB")}
            label="Chosen"
          />
          <Stat figure={detail.days.length} label="Days" />
          <Stat
            figure={`${(detail.totalBytes / 1024 / 1024).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`}
            label="To send"
          />
        </div>
        <Banner>
          The batch is grouped by the day each file was captured on, which is
          where each one will land in the archive. Nothing here is one post.
        </Banner>
        <Prose>
          Press a print to tick it. Ticking several gives you the bar at the
          top: one tag, one person or one milestone applied to the lot, instead
          of the same thing done two hundred times.
        </Prose>
      </Stack>
    </Sheet>
  );
}
type VisibilityOptions = {
  members: PeopleFieldMember[];
  groups: PeopleFieldGroup[];
  isUnavailable: boolean;
  onRetry: () => void;
};
function useVisibilityOptions(
  visibility: Readonly<SetUploadVisibilityRequest>,
): VisibilityOptions {
  const members = useQuery({
    ...membersQueryOptions(),
    enabled: visibility.mode !== "everyone",
  });
  const groups = useQuery({
    ...groupsQueryOptions(),
    enabled: visibility.mode !== "everyone",
  });
  return {
    members: members.data?.members ?? [],
    groups: groups.data?.groups ?? [],
    isUnavailable:
      visibility.mode !== "everyone" && (members.isError || groups.isError),
    onRetry: () => {
      void members.refetch();
      void groups.refetch();
    },
  };
}
function _getVisibilitySubjectsFromIds(
  ids: readonly string[],
  props: Readonly<Props>,
  options: Readonly<VisibilityOptions>,
): SetUploadVisibilityRequest["subjects"] {
  return ids.flatMap((id) => {
    const existing = props.visibility.subjects.find((subject) => {
      return subject.id === id;
    });
    if (existing) {
      return [existing];
    }
    if (
      options.groups.some((group) => {
        return group.groupId === id;
      })
    ) {
      return [{ kind: "group" as const, id }];
    }
    return options.members.some((member) => {
      return member.memberId === id;
    })
      ? [{ kind: "member" as const, id }]
      : [];
  });
}
function _draftVisibility(
  props: Readonly<Props>,
  options: Readonly<VisibilityOptions>,
): ReactNode {
  const { snapshot, visibility, onVisibilityChange } = props;
  return (
    <Sheet wide label="Who can see these">
      <fieldset disabled={snapshot.isBusy} className={previewClasses.fields}>
        <VisibilityControl
          heading="Who can see all of these"
          mode={visibility.mode}
          onModeChange={(mode) => {
            onVisibilityChange({ mode, subjects: [] });
          }}
          subjects={visibility.subjects.map((subject) => {
            return subject.id;
          })}
          onSubjectsChange={(ids) => {
            onVisibilityChange({
              mode: visibility.mode,
              subjects: _getVisibilitySubjectsFromIds(ids, props, options),
            });
          }}
          members={options.members}
          groups={options.groups}
        />
      </fieldset>
      {options.isUnavailable ? (
        <div role="alert">
          <Prose>Some visibility choices are unavailable.</Prose>
          <Button variant="default" onClick={options.onRetry}>
            Retry visibility choices
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
function _draftDays({
  snapshot,
  controller,
  previews,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="The days in this batch">
      {snapshot.detail!.days.map((day) => {
        return (
          <UploadDayGroup
            key={day.capturedOn}
            day={day}
            snapshot={snapshot}
            controller={controller}
            previews={previews}
          />
        );
      })}
    </Sheet>
  );
}
function _draftFooter({
  snapshot,
  controller,
  visibility,
  onStart,
}: Readonly<Props>): ReactNode {
  const accepted = snapshot.detail!.files.filter((file) => {
    return file.state !== "refused" && file.state !== "cancelled";
  }).length;
  return (
    <ChipRow>
      <Button
        disabled={
          snapshot.isBusy ||
          accepted === 0 ||
          !setUploadVisibilityRequestSchema.safeParse(visibility).success
        }
        onClick={onStart}
      >
        Put {accepted.toLocaleString("en-GB")} up
      </Button>
      <Button
        variant="panel"
        disabled={snapshot.isBusy}
        onClick={() => {
          void controller.cancelDraft().catch(() => {});
        }}
      >
        Cancel
      </Button>
    </ChipRow>
  );
}
function _draftContent(
  props: Readonly<Props>,
  options: Readonly<VisibilityOptions>,
): ReactNode {
  return (
    <Stack gap="lg">
      {_draftOverview(props.snapshot)}
      <UploadEdits snapshot={props.snapshot} controller={props.controller} />
      <UploadUndated snapshot={props.snapshot} controller={props.controller} />
      {_draftDays(props)}
      {_draftVisibility(props, options)}
      {_draftFooter(props)}
    </Stack>
  );
}
/** Composes optional draft editing without making ticks a condition of upload. */
export function UploadDraft({
  snapshot,
  controller,
  previews,
  visibility,
  onVisibilityChange,
  onStart,
  onOpenMilestone,
}: Readonly<Props>): ReactNode {
  const [labelKind, setLabelKind] = useState<"tag" | "person">();
  const options = useVisibilityOptions(visibility);
  const props = {
    snapshot,
    controller,
    previews,
    visibility,
    onVisibilityChange,
    onStart,
    onOpenMilestone,
  };
  return !snapshot.detail ? null : (
    <>
      <UploadSelectionBar
        snapshot={snapshot}
        controller={controller}
        onOpenLabel={setLabelKind}
        onOpenMilestone={onOpenMilestone}
      />
      {_draftContent(props, options)}
      {labelKind ? (
        <UploadLabelModal
          key={labelKind}
          kind={labelKind}
          opened
          snapshot={snapshot}
          controller={controller}
          onClose={() => {
            setLabelKind(undefined);
          }}
        />
      ) : null}
    </>
  );
}
