import { Stack, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { DirectoryPerson } from "@memory-shoebox/shared";
import { peopleQueryOptions } from "@/api/vocabularies/vocabularies";
import { PersonCard } from "@/surfaces/People/PersonCard";
import { Banner } from "@/system/Chrome/Banner";
import { Page } from "@/system/Chrome/Page";
import { ICON_PROPS } from "@/system/icons";
import { LabelText } from "@/system/typography/LabelText";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  /** What is typed in the field, carried in the URL like every other filter. */
  q: string | undefined;
};

/**
 * The field itself.
 *
 * Every change navigates immediately with `replace: true`, so typing narrows
 * the URL without leaving one history entry per keystroke behind somebody's
 * back button. The query the field's value drives is debounced separately,
 * in `PeopleSurface`.
 */
function _searchField(options: {
  q: string;
  onChange: (typed: string) => void;
}): ReactNode {
  const { q, onChange } = options;
  return (
    <TextInput
      label="Find somebody"
      placeholder="Start typing a name"
      leftSection={<IconSearch {...ICON_PROPS} />}
      value={q}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    />
  );
}

/** Somebody tagged but never photographed: why they are in the directory. */
function _unphotographedBanner(): ReactNode {
  return (
    <Banner onPanel>
      <b>Somebody here has been tagged but never photographed.</b> They were
      added so that the moment somebody puts up a photograph with them in it, it
      lands on a name that already exists rather than making a second one.
    </Banner>
  );
}

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
 * The heading that says how much of the directory is showing, then the grid.
 *
 * `total` is `peopleCount`, never `people.length`: it is not per viewer, so
 * "6 of 10 people" cannot be misread as somebody having been removed.
 */
function _directoryGrid(options: {
  people: readonly DirectoryPerson[];
  total: number;
  isNarrowed: boolean;
}): ReactNode {
  const { people, total, isNarrowed } = options;
  return (
    <div>
      <LabelText component="h2">
        {isNarrowed ? `${people.length} of ${total} people` : `${total} people`}
      </LabelText>
      <div className={classes.peopleGrid}>
        {people.map((entry) => {
          return <PersonCard key={entry.person.personId} entry={entry} />;
        })}
      </div>
    </div>
  );
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
    peopleQueryOptions(search === "" ? undefined : search),
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
          Pressing a name filters the pile to the photographs and videos they
          are in. There is no page for a person: a person is a way into the
          archive, not a profile in it.
        </Prose>
        {_searchField({ q: q ?? "", onChange: _makeOnTyped(navigate) })}
        {hasUnphotographed ? _unphotographedBanner() : null}
        {_directoryGrid({ people, total, isNarrowed })}
        <Prose onPanel>
          Some of these people can sign in and some cannot, and the directory
          does not say which. A tag says who is in a photograph; it never says
          who may open one.
        </Prose>
      </Stack>
    </Page>
  );
}
