import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { Prose } from "@/system/typography/Prose";

type Props = { displayName: string };
/** Removal ends access while keeping authorship, uploads and person tags. */
export function MemberRemovalConsequences({
  displayName,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Prose>
        {displayName} loses access straight away, on every device. Nothing they
        uploaded or wrote is deleted, and their name stays on it.
      </Prose>
      <Banner>
        They stay a person in the archive. Photographs tagged with them keep the
        tag, so inviting them back later picks up where this left off.
      </Banner>
    </>
  );
}
