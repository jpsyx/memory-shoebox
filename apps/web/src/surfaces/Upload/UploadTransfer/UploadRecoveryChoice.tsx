import { Button } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
type Props = { snapshot: UploadSnapshot; controller: UploadSessionController };
function _getRecoveryOptionsFromSnapshot(
  snapshot: Readonly<UploadSnapshot>,
): Array<{ fileId: string; label: string }> {
  return snapshot.recoveryMatches.ambiguous[0]!.fileIds.map((fileId) => {
    const row = snapshot.detail!.files.find((file) => {
      return file.fileId === fileId;
    })!;
    return {
      fileId,
      label: `${row.originalFilename}, saved file ${row.position + 1}, ${row.capturedOn ?? "undated"}`,
    };
  });
}
/** A native id-valued picker disambiguates one original before transfer. */
export function UploadRecoveryChoice({
  snapshot,
  controller,
}: Readonly<Props>): ReactNode {
  const match = snapshot.recoveryMatches.ambiguous[0]!;
  const [choice, setChoice] = useState("");
  const onConfirm = () => {
    void controller
      .confirmRecoveryMatch({ fileId: choice, clientRef: match.clientRef })
      .catch(() => {});
  };
  return (
    <>
      <Prose>
        A chosen file could match more than one saved original. Choose which one
        it is before any transfer starts.
      </Prose>
      <label>
        Saved original
        <select
          aria-label="Saved original"
          value={choice}
          disabled={snapshot.isBusy}
          onChange={(event) => {
            setChoice(event.currentTarget.value);
          }}
        >
          <option value="">Choose the matching original</option>
          {_getRecoveryOptionsFromSnapshot(snapshot).map(
            ({ fileId, label }) => {
              return <option key={fileId} value={fileId} label={label} />;
            },
          )}
        </select>
      </label>
      <Button
        disabled={snapshot.isBusy || !match.fileIds.includes(choice)}
        onClick={onConfirm}
      >
        Use this original
      </Button>
    </>
  );
}
