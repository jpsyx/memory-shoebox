import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { PeopleRow } from "@/surfaces/Item/InThisOne/PeopleRow";
import { TagsRow } from "@/surfaces/Item/InThisOne/TagsRow";
import { peopleTagProse } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";

type Props = {
  detail: ItemDetail;
};

/**
 * Who and what is in it. A tag on a person grants them nothing, and the
 * sheet says so in a sentence rather than leaving anybody to wonder.
 */
export function InThisOne({ detail }: Readonly<Props>): ReactNode {
  return (
    <Sheet label="What is in this one">
      <LabelText component="h2">In this one</LabelText>
      <Stack gap="sm" mt="sm">
        <PeopleRow detail={detail} />
        <TagsRow detail={detail} />
        <Prose>{peopleTagProse(detail.kind)}</Prose>
      </Stack>
    </Sheet>
  );
}
