import { Button, Stack, Textarea } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { describeProse, kindNoun } from "@/surfaces/Item/itemCopy/itemCopy";
import { useSetItemAltText } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
};

/**
 * For somebody listening: the alt text override.
 *
 * **Pre-filled from `altTextOverride` and never from `media.altText`.** The
 * second is the composed line whenever no override exists, and saving it back
 * would turn an honest default into a typed override nobody wrote (decision
 * 10). It saves on a button, because a sentence somebody is writing is not
 * finished on every keystroke.
 */
export function Describing({ detail }: Readonly<Props>): ReactNode {
  const write = useSetItemAltText(detail.itemId);
  const saved = detail.altTextOverride ?? "";
  const [draft, setDraft] = useState(saved);
  const generated =
    detail.altTextOverride === null ? detail.media.altText : undefined;
  return (
    <Sheet label="Describing it">
      <Stack gap="sm">
        <LabelText component="h2">For somebody listening</LabelText>
        <Textarea
          label={`Describe this ${kindNoun(detail.kind)}`}
          description="Optional. Read aloud by a screen reader instead of the line below."
          placeholder="Papá in scrubs holding Mateo, minutes old"
          value={draft}
          autosize
          minRows={2}
          maxLength={LIMITS.altTextMaxLength}
          onChange={(event) => {
            return setDraft(event.currentTarget.value);
          }}
        />
        <Prose>{describeProse({ draft, generated })}</Prose>
        {write.error === undefined ? null : (
          <Prose role="alert">{write.error}</Prose>
        )}
        <ChipRow>
          <Button
            disabled={draft.trim() === saved.trim() || write.isSaving}
            onClick={() => {
              write.save(draft.trim() === "" ? null : draft.trim());
            }}
          >
            {write.isSaving ? "Saving" : "Save the description"}
          </Button>
        </ChipRow>
      </Stack>
    </Sheet>
  );
}
