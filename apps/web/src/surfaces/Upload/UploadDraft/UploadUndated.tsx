import type { UploadFileDto } from "@memory-shoebox/shared";
import { Button, Stack, TextInput } from "@mantine/core";
import { useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };
type DateForm = {
  capturedOn: string;
  error?: string;
  isPending: boolean;
  onDateChange: (date: string) => void;
  onSubmit: () => Promise<void>;
};
function _undatedFilenames(snapshot: Readonly<UploadSnapshot>): ReactNode {
  return (
    <ul>
      {_getUndatedFilesFromSnapshot(snapshot).map((file) => {
        return <li key={file.fileId}>{file.originalFilename}</li>;
      })}
    </ul>
  );
}
function _undatedSheet(
  options: Readonly<{
    snapshot: UploadSnapshot;
    count: number;
    form: DateForm;
  }>,
): ReactNode {
  const { snapshot, count, form } = options;
  return (
    <Sheet wide label="Undated files">
      <Stack gap="sm">
        <LabelText component="h2">{count} undated</LabelText>
        <Prose>
          These files did not carry a usable capture date. Set a day if you know
          it, or put them up as they are. Adding a date is optional.
        </Prose>
        {_undatedFilenames(snapshot)}
        <TextInput
          type="date"
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
          Set date for {count}
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
function _getUndatedFilesFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): UploadFileDto[] {
  return (
    snapshot.detail?.files.filter((file) => {
      return file.capturedOn === null && file.state === "waiting";
    }) ?? []
  );
}
/** Optional correction for undated rows; all accepted files may still go up. */
export function UploadUndated({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const [capturedOn, setCapturedOn] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const files = _getUndatedFilesFromSnapshot(snapshot);
  const onSubmit = async () => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setIsPending(true);
    setError(undefined);
    try {
      await controller.amendDates(
        files.map((file) => {
          return { fileId: file.fileId, capturedOn };
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  };
  return files.length === 0
    ? null
    : _undatedSheet({
        snapshot,
        count: files.length,
        form: {
          capturedOn,
          error,
          isPending,
          onDateChange: setCapturedOn,
          onSubmit,
        },
      });
}
