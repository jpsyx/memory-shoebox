import { makePeopleQueryOptionsFromSearchScope } from "@/api/vocabularies/vocabularies";
import { DirectoryGrid } from "@/surfaces/People/PeopleSurface/DirectoryGrid";
import { SearchField } from "@/surfaces/People/PeopleSurface/SearchField";
import { UnphotographedBanner } from "@/surfaces/People/PeopleSurface/UnphotographedBanner";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { Stack } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
type Props = {
  /** What is typed in the field, carried in the URL like every other filter. */
  q: string | undefined;
};

/**
 * The field's own change handler: navigate immediately, `q` or nothing.
 *
 * A plain function rather than a closure written inline in `PeopleSurface`,
 * so that component stays a layout and this stays a one-line call there.
 */
function _makeOnTyped(
  navigate: ReturnType<typeof useNavigate>,
): (typed: string) => void {
  return (typed) => {
    void navigate({
      to: "/people",
      search: typed === "" ? {} : { q: typed },
      replace: true,
    });
  };
}

/**
 * Surface 7: everybody tagged in the archive, as a way into the pile.
 *
 * `peopleCount` is the directory before `q` narrows it, so the heading can
 * say "6 of 10 people" and nobody concludes somebody has been removed. It is
 * one of the three documented exceptions to the per-viewer counting rule: a
 * person's existence is not visibility-scoped, only their photographs are.
 *
 * **Members and non-members are drawn identically** (see `PersonCard`): the
 * banner below, and the closing note, both say a tag is not a login.
 */
export function PeopleSurface({ q }: Readonly<Props>): ReactNode {
  const navigate = useNavigate();
  const [search] = useDebouncedValue(q ?? "", 250);
  const directory = useQuery(
    makePeopleQueryOptionsFromSearchScope({
      q: search === "" ? undefined : search,
    }),
  );
  const people = directory.data?.people ?? [];
  const total = directory.data?.peopleCount ?? 0;
  const isNarrowed = (q ?? "") !== "";
  const hasUnphotographed = people.some((entry) => {
    return entry.itemCount === 0;
  });

  return (
    <Page wide>
      <Stack gap="md">
        <Lede>Everybody in the archive.</Lede>
        <Prose onPanel>
          Pressing a name filters the timeline to the photographs and videos
          they are in. There is no page for a person: a person is a way into the
          archive, not a profile in it.
        </Prose>
        <SearchField q={q ?? ""} onChange={_makeOnTyped(navigate)} />
        {hasUnphotographed ? <UnphotographedBanner /> : null}
        <DirectoryGrid people={people} total={total} isNarrowed={isNarrowed} />
        <Prose onPanel>
          Some of these people can sign in and some cannot, and the directory
          does not say which. A tag says who is in a photograph; it never says
          who may open one.
        </Prose>
      </Stack>
    </Page>
  );
}
