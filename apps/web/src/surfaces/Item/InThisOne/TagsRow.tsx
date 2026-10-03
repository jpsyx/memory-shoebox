import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Chip } from "@/system/Chip/Chip";
import { ChipLink } from "@/system/Chip/ChipLink";
import { ChipRow } from "@/system/Chip/ChipRow";
import { TagsEditor } from "@/surfaces/Item/InThisOne/TagsEditor";

type Props = {
  detail: ItemDetail;
};

/** The tags: each a link into the pile filtered by it, and an editor. */
export function TagsRow({ detail }: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  if (isEditing) {
    return (
      <TagsEditor
        detail={detail}
        onDone={() => {
          return setIsEditing(false);
        }}
      />
    );
  }
  return (
    <ChipRow>
      {detail.tags.map((tag) => {
        return (
          <ChipLink key={tag.tagId} to="/" search={{ tag: tag.tagId }}>
            {tag.name}
          </ChipLink>
        );
      })}
      {detail.capabilities.canEditTags ? (
        <Chip
          onClick={() => {
            return setIsEditing(true);
          }}
        >
          + Add a tag
        </Chip>
      ) : null}
    </ChipRow>
  );
}
