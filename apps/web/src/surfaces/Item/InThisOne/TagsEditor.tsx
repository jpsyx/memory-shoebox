import { Stack, TagsInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import { tagsQueryOptions } from "@/api/vocabularies/vocabularies";
import { EditorFooter } from "@/surfaces/Item/InThisOne/EditorFooter";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useItemEdits";

type Props = {
  detail: ItemDetail;
  onDone: () => void;
};

/** The tag names on the item now. */
function _tagNamesOf(detail: ItemDetail): string[] {
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
  const [names, setNames] = useState(() => {
    return _tagNamesOf(detail);
  });

  return (
    <Stack gap="sm">
      <TagsInput
        label="Tags"
        description="Anything you would look for it by later. Press Enter after each one."
        placeholder="beach, first steps"
        data={(vocabulary.data?.tags ?? []).map((entry) => {
          return entry.tag.name;
        })}
        value={names}
        maxTags={LIMITS.itemMaxTags}
        splitChars={[","]}
        onChange={(nextNames) => {
          setNames(nextNames);
          write.save(nextNames, {
            onError: () => {
              setNames(_tagNamesOf(detail));
            },
          });
        }}
      />
      <EditorFooter error={write.error} onDone={onDone} />
    </Stack>
  );
}
