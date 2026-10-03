import { Stack, TagsInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { tagsQueryOptions } from "@/api/vocabularies/vocabularies";
import { Prose } from "@/system/typography/Prose";
import { EditorFooter } from "@/surfaces/Item/InThisOne/EditorFooter";
import { useNameField } from "@/surfaces/Item/InThisOne/useNameField";
import { tagsCapProse } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useSetItemTags";

type Props = {
  detail: ItemDetail;
  onDone: () => void;
};

/**
 * Tagging, which saves as it changes. Free text, suggested from the tags the
 * archive already has; the server keeps an existing tag's own spelling, so
 * typing "hospital" never renames "Hospital" under the other items.
 */
export function TagsEditor({ detail, onDone }: Readonly<Props>): ReactNode {
  const vocabulary = useQuery(tagsQueryOptions(undefined));
  const write = useSetItemTags(detail.itemId);
  const field = useNameField({
    detail,
    namesOf: (itemDetail) => {
      return itemDetail.tags.map((tag) => {
        return tag.name;
      });
    },
    max: LIMITS.itemMaxTags,
    save: write.save,
  });

  return (
    <Stack gap="sm">
      <TagsInput
        label="Tags"
        description="Anything you would look for it by later. Press Enter after each one."
        placeholder="beach, first steps"
        autoFocus
        data={(vocabulary.data?.tags ?? []).map((entry) => {
          return entry.tag.name;
        })}
        value={field.names}
        maxTags={LIMITS.itemMaxTags}
        splitChars={[","]}
        onChange={field.onChange}
      />
      {field.isFull ? <Prose>{tagsCapProse(detail.kind)}</Prose> : null}
      <EditorFooter error={write.error} onDone={onDone} />
    </Stack>
  );
}
