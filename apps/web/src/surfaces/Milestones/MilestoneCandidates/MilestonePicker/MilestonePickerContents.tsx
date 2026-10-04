import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import type {
  MilestoneAttachment,
  MilestoneAttachmentOptions,
} from "../../useMilestoneAttachment/useMilestoneAttachment.types";
import { MilestonePickerChoices } from "./MilestonePickerChoices/MilestonePickerChoices";
import { MilestonePickerControls } from "./MilestonePickerControls";
type Props = {
  options: MilestoneAttachmentOptions;
  picker: MilestoneAttachment;
  onDone: () => void;
};
/** Picker instructions, retained counts, recovery and native controls. */
export function MilestonePickerContents({
  options,
  picker,
  onDone,
}: Readonly<Props>): ReactNode {
  const hasAuthority =
    options.detail.canEdit && options.hasUsableAuthority !== false;
  return (
    <Sheet wide label="Photographs for this occasion">
      <SheetHead title={options.detail.milestone.name} />
      <Stack gap="md">
        <Prose>
          {options.source === "span"
            ? "The occasion is saved. Choose photographs from its dates, or leave it empty."
            : "Choose photographs for this occasion. They stay on the days they were taken."}
        </Prose>
        <Prose role="status">
          {picker.chosenCount} chosen; {picker.attachCount} to attach,{" "}
          {picker.detachCount} to detach.
        </Prose>
        {picker.error ? <Prose role="alert">{picker.error}</Prose> : null}
        {!hasAuthority ? (
          <Prose role="status">
            Refresh the occasion before saving. Your choices are kept.
          </Prose>
        ) : null}
        <MilestonePickerChoices picker={picker} />
        {picker.isReading ? (
          <Prose role="status">Reading photographs.</Prose>
        ) : null}
        {!picker.isReading && picker.entries.length === 0 ? (
          <Prose>No photographs are shown for these choices.</Prose>
        ) : null}
        <MilestonePickerControls
          picker={picker}
          hasAuthority={hasAuthority}
          onDone={onDone}
        />
      </Stack>
    </Sheet>
  );
}
