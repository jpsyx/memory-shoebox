import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { ReactNode } from "react";
import { Select } from "@/system/Select/Select";
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
    <Select
      label="Saved original"
      value={choice}
      disabled={snapshot.isBusy}
      onChange={onChange}
      data={[
        { value: "", label: "Choose the matching original" },
        ..._getRecoveryOptionsFromSnapshot(snapshot).map(
          ({ fileId, label }) => {
            return { value: fileId, label };
          },
        ),
      ]}
    />
  );
}
