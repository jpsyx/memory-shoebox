import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Button, Stack, TextInput } from "@mantine/core";
import { type ReactNode } from "react";
import { UploadUndatedFilenames } from "./UploadUndatedFilenames";
import classes from "./UploadUndatedSheet.module.css";
type DateForm = {
  capturedOn: string;
  error?: string;
  isPending: boolean;
  onDateChange: (date: string) => void;
  onSubmit: () => Promise<void>;
};
type Props = {
  options: Readonly<{
    snapshot: UploadSnapshot;
    undatedFileCount: number;
    form: DateForm;
  }>;
};

/** Collects an optional date for the undated originals. */
export function UploadUndatedSheet({ options }: Readonly<Props>): ReactNode {
  const { snapshot, undatedFileCount, form } = options;
  return (
    <Sheet wide label="Undated files">
      <Stack gap="sm">
        <LabelText component="h2">{undatedFileCount} undated</LabelText>
        <Prose>
          These files did not carry a usable capture date. Set a day if you know
          it, or put them up as they are. Adding a date is optional.
        </Prose>
        <UploadUndatedFilenames snapshot={snapshot} />
        <TextInput
          type="date"
          classNames={{ input: classes.uploadUndatedSheetPrintDateInput }}
          label="Capture date"
          value={form.capturedOn}
          onChange={(event) => {
            form.onDateChange(event.currentTarget.value);
          }}
          disabled={form.isPending || snapshot.isBusy}
        />
        <Button
          disabled={!form.capturedOn || form.isPending || snapshot.isBusy}
          loading={form.isPending}
          onClick={() => {
            void form.onSubmit();
          }}
        >
          Set date for {undatedFileCount}
        </Button>
        {form.error ? (
          <div role="alert">
            <Prose>{form.error}</Prose>
          </div>
        ) : null}
      </Stack>
    </Sheet>
  );
}
