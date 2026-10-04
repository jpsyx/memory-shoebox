import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
import { Stack } from "@mantine/core";
import { type ReactNode } from "react";
import { UploadEditRow } from "./UploadEditRow";
type SavedPlanOptions = {
  snapshot: UploadSnapshot;
  onUndo: (editId: string) => void;
  isPending: boolean;
  error?: string;
};
type Props = {
  options: Readonly<SavedPlanOptions>;
};

/** Lists the saved batch edits independently of the current selection. */
export function UploadSavedPlan({ options }: Readonly<Props>): ReactNode {
  const edits =
    options.snapshot.detail?.edits.filter((edit) => {
      return edit.undoneAt === null;
    }) ?? [];
  return edits.length === 0 ? null : (
    <Sheet wide label="What you have added">
      <Stack gap="sm">
        <LabelText component="h2">What you have added</LabelText>
        <Prose>
          Everything a bulk action has put on this batch, and what it landed on.
          Labels can be taken off while this batch is a draft.
        </Prose>
        <div>
          {edits.map((edit) => {
            return (
              <UploadEditRow
                key={edit.editId}
                edit={edit}
                snapshot={options.snapshot}
                onUndo={options.onUndo}
                isPending={options.isPending}
              />
            );
          })}
        </div>
        {options.error ? (
          <div role="alert">
            <Prose>{options.error}</Prose>
          </div>
        ) : null}
      </Stack>
    </Sheet>
  );
}
