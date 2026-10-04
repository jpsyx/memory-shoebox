import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
import type { ReactNode } from "react";
type Props = {
  snapshot: UploadSnapshot;
  choice: string;
  onChange: (fileId: string) => void;
};
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

/**
 * Saved candidates retain their manifest position and authoritative
 * capture day.
 */
export function UploadSavedOriginalPicker({
  snapshot,
  choice,
  onChange,
}: Readonly<Props>): ReactNode {
  return (
    <label>
      Saved original
      <select
        aria-label="Saved original"
        value={choice}
        disabled={snapshot.isBusy}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      >
        <option value="">Choose the matching original</option>
        {_getRecoveryOptionsFromSnapshot(snapshot).map(({ fileId, label }) => {
          return (
            <option key={fileId} value={fileId}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
