import { Stack, TagsInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { tagsQueryOptions } from "@/api/vocabularies/vocabularies";
import { Prose } from "@/system/typography/Prose";
import { EditorFooter } from "@/surfaces/Item/InThisOne/EditorFooter";
import { useNameField } from "@/surfaces/Item/InThisOne/useNameField";
import { tagsCapProse } from "@/surfaces/Item/itemCopy/itemCopy";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
  onDone: () => void;
};

/** The tag names on an item. */
function _tagNamesOf(detail: Readonly<ItemDetail>): string[] {
  return detail.tags.map((tag) => {
    return tag.name;
  });
}

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
    namesOf: _tagNamesOf,
    max: LIMITS.itemMaxTags,
    save: (names, callbacks) => {
      write.save([...names], callbacks);
    },
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
