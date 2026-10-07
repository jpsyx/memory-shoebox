import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Sheet } from "@/system/Chrome/Sheet";
import { LabelText } from "@/system/typography/LabelText";
import { PeopleRow } from "@/surfaces/Item/InThisOne/PeopleRow";
import { TagsRow } from "@/surfaces/Item/InThisOne/TagsRow";

type Props = {
  detail: ItemDetail;
};

/** Who and what is in it, with editors when permitted. */
export function InThisOne({ detail }: Readonly<Props>): ReactNode {
  return (
    <Sheet label="What is in this one">
      <LabelText component="h2">In this one</LabelText>
      <Stack gap="sm" mt="sm">
        <PeopleRow detail={detail} />
        <TagsRow detail={detail} />
      </Stack>
    </Sheet>
  );
}
