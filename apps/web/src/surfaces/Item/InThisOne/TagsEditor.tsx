import { makeTagsQueryOptionsFromSearchScope } from "@/api/vocabularies/vocabularies";
import { EditorFooter } from "@/surfaces/Item/InThisOne/EditorFooter";
import { useNameField } from "@/surfaces/Item/InThisOne/useNameField";
import { tagsCapProse } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useSetItemTags";
import { Prose } from "@/system/typography/Prose";
import { Stack, TagsInput } from "@mantine/core";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
  const vocabulary = useQuery(
    makeTagsQueryOptionsFromSearchScope({ q: undefined }),
  );
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
