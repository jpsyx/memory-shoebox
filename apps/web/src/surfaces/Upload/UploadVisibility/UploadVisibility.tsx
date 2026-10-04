import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type {
  MemberRef,
  VisibilitySummary,
  SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import { makeResolveRequestFromChoice } from "@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers";
import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import { VisibilityControl } from "@/system/VisibilityControl/VisibilityControl";
import { useUploadVisibilityOptions } from "./useUploadVisibilityOptions";
import { UploadVisibilityUnavailable } from "./UploadVisibilityUnavailable";
import classes from "../upload.module.css";
type Props = {
  choice: SetUploadVisibilityRequest;
  saved: VisibilitySummary;
  viewer: MemberRef;
  onChange: (choice: SetUploadVisibilityRequest) => void;
  isDisabled?: boolean;
};
function useUploadVisibilityControl({
  choice,
  saved,
  viewer,
  onChange,
}: Readonly<Props>) {
  const enabled = choice.mode !== "everyone";
  const options = useUploadVisibilityOptions({
    viewer,
    saved,
    isEnabled: enabled,
  });
  return {
    ...options,
    enabled,
    subjectIds: choice.subjects.map((subject) => {
      return subject.id;
    }),
    onModeChange: (mode: SetUploadVisibilityRequest["mode"]) => {
      onChange({ mode, subjects: [] });
    },
    onSubjectsChange: (subjectIds: readonly string[]) => {
      onChange(
        makeResolveRequestFromChoice({
          mode: choice.mode,
          subjectIds,
          groups: options.groups,
        }),
      );
    },
  };
}
/** Preserves saved subjects and the viewer when live directories are absent. */
export function UploadVisibility({
  choice,
  saved,
  viewer,
  onChange,
  isDisabled = false,
}: Readonly<Props>): ReactNode {
  const options = useUploadVisibilityControl({
    choice,
    saved,
    viewer,
    onChange,
  });
  return (
    <Sheet wide label="Who can see these">
      <Stack gap="sm">
        <fieldset disabled={isDisabled} className={classes.fields}>
          <VisibilityControl
            heading="Who can see all of these"
            mode={choice.mode}
            onModeChange={options.onModeChange}
            subjects={options.subjectIds}
            onSubjectsChange={options.onSubjectsChange}
            members={options.members}
            groups={options.groups}
          />
        </fieldset>
        {options.enabled && choice.subjects.length === 0 ? (
          <Prose>Name a person or group first, or choose Everyone.</Prose>
        ) : null}
        <UploadVisibilityUnavailable
          isUnavailable={options.isUnavailable}
          onRetry={options.onRetry}
        />
      </Stack>
    </Sheet>
  );
}
