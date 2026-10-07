import { makePeopleQueryOptionsFromSearchScope } from "@/api/vocabularies/vocabularies";
import { DirectoryGrid } from "@/surfaces/People/PeopleSurface/DirectoryGrid";
import { SearchField } from "@/surfaces/People/PeopleSurface/SearchField";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
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

  return (
    <Page wide>
      <Stack gap="md">
        <Lede>Everybody in the archive.</Lede>
        <SearchField q={q ?? ""} onChange={_makeOnTyped(navigate)} />
        <DirectoryGrid people={people} total={total} isNarrowed={isNarrowed} />
      </Stack>
    </Page>
  );
}
