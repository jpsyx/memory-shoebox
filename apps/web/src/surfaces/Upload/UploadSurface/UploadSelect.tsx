import { ChipRow } from "@/system/Chip/ChipRow";
import { Button, Stack } from "@mantine/core";
import type {
  MemberRef,
  SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { UploadVisibility } from "../UploadVisibility/UploadVisibility";
import { UploadFilePicker } from "./UploadFilePicker/UploadFilePicker";
type Props = {
  choice: SetUploadVisibilityRequest;
  viewer: MemberRef;
  onChange: (choice: Readonly<SetUploadVisibilityRequest>) => void;
  onPick: (files: readonly File[]) => void;
};
/** Initial selection asks for everything and starts with Everyone. */
export function UploadSelect({
  choice,
  viewer,
  onChange,
  onPick,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="lg">
      <UploadFilePicker onPick={onPick} isDropzone />
      <UploadVisibility
        choice={choice}
        saved={{
          visibilityRuleId: "everyone",
          mode: "everyone",
          label: null,
          subjects: [],
        }}
        viewer={viewer}
        onChange={onChange}
      />
      <ChipRow>
        <Button disabled>Put them up</Button>
        <Button variant="panel" disabled>
          Cancel
        </Button>
      </ChipRow>
    </Stack>
  );
}
