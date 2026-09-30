import type { ReactNode } from "react";
import type { PersonFacet, TagFacet } from "@memory-shoebox/shared";
import { Prose } from "@/system/typography/Prose";

type Props = {
  people: readonly PersonFacet[];
  tags: readonly TagFacet[];
  hasDates: boolean;
};

/**
 * The sentence explaining why nothing came back.
 *
 * The numbers are the `ownCount` the server sends on a selected chip and
 * nowhere else: "Elena is in 23 photographs and there are 141 tagged beach,
 * but none of them are the same ones".
 */
export function Explanation({
  people,
  tags,
  hasDates,
}: Readonly<Props>): ReactNode {
  return (
    <Prose onPanel>
      {people.map((facet) => {
        return `${facet.person.displayName} is in ${facet.ownCount ?? 0} photographs. `;
      })}
      {tags.map((facet) => {
        return `There are ${facet.ownCount ?? 0} tagged ${facet.tag.name}. `;
      })}
      None of them are the same ones
      {hasDates ? ", and none are in that stretch of time" : ""}. Take one
      filter off and it will find something.
    </Prose>
  );
}
