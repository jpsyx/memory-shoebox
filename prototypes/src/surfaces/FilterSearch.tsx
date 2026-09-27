import { Button, Stack, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { ARCHIVE_DAYS, PEOPLE, TAGS, type ArchiveDay } from "@/data/fixtures";
import { Sheet, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { FilterStrip } from "@/system/FilterStrip";
import { ICON_PROPS } from "@/system/icons";
import { Archive, DayRow, DaySpine, Ghosts, Pile, Print } from "@/system/Pile";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type FilterState = "open" | "tag" | "person" | "dates" | "several" | "none";

interface ActiveFilters {
  readonly people: readonly string[];
  readonly tags: readonly string[];
  readonly from?: string;
  readonly until?: string;
}

const FILTERS: Record<FilterState, ActiveFilters> = {
  open: { people: [], tags: [] },
  tag: { people: [], tags: ["hospital"] },
  person: { people: ["Abuela Rosa"], tags: [] },
  dates: { people: [], tags: [], from: "2026-09-01", until: "2026-09-30" },
  several: {
    people: ["Mateo", "Abuela Rosa"],
    tags: ["hospital"],
    from: "2026-09-01",
    until: "2026-09-30",
  },
  none: {
    people: ["Bisabuela Elena"],
    tags: ["beach"],
    from: "2026-09-01",
    until: "2026-09-30",
  },
};

const RESULT_COUNTS: Record<FilterState, number> = {
  open: 2147,
  tag: 412,
  person: 207,
  dates: 474,
  several: 88,
  none: 0,
};

/** Splits a result total across the days it landed on, heaviest day first. */
function narrowDays(
  days: readonly ArchiveDay[],
  total: number,
): readonly ArchiveDay[] {
  const weights = days.map((day) => {
    return day.itemCount;
  });
  const weightSum = weights.reduce((sum, weight) => {
    return sum + weight;
  }, 0);
  let remaining = total;
  return days.map((day, index) => {
    const isLast = index === days.length - 1;
    const share = isLast
      ? remaining
      : Math.round((total * (weights[index] ?? 0)) / weightSum);
    remaining -= share;
    return { ...day, itemCount: share, unseenCount: 0 };
  });
}

/**
 * What a chip's count means once something is already selected.
 *
 * It is what adding this one to what is already chosen would leave, not what
 * it is worth on its own. That is the only version anybody can act on: the
 * whole reason to look at these numbers is to avoid pressing something and
 * landing on nothing.
 *
 * A zero stays on the row and goes quiet rather than disappearing, for two
 * reasons. A row that reshuffles under a finger is worse than a row with a
 * dead chip in it, and `beach 0` is itself the answer to "is there anything
 * from the beach with Abuela in it".
 *
 * The cost is real and is accepted: the most expensive query on the surface
 * runs again on every change rather than once. At this size that is tens of
 * milliseconds on something somebody pressed. Debounce the text field.
 */
function narrowedCount(own: number, total: number, seed: number): number {
  if (total === 0) {
    return 0;
  }
  /* Deterministic, so the row does not flicker between renders. */
  const spread = (seed * 5) % 13;
  if (spread < 2) {
    return 0;
  }
  return Math.max(1, Math.min(own, Math.round((total * spread) / 31)));
}

function isActive(filters: ActiveFilters): boolean {
  return (
    filters.people.length > 0 ||
    filters.tags.length > 0 ||
    filters.from !== undefined
  );
}

/**
 * The results, which are the pile again rather than a different object: same
 * spine, same prints, same stacks. Each day's count is the filtered count, not
 * the day's own, because a spine that still says 212 while the strip says 88
 * is telling two different stories about the same screen.
 */
function Results({
  days,
  countLabel,
}: {
  readonly days: readonly ArchiveDay[];
  readonly countLabel: string;
}) {
  return (
    <Archive component="section">
      {days.map((day) => {
        return (
          <DayRow key={day.id}>
            <DaySpine day={day} countLabel={countLabel} />
            <Pile>
              {day.items.slice(0, 9).map((item, index) => {
                return (
                  <Print
                    key={item.id}
                    media={item.media}
                    seed={index}
                    unseen={item.unseen}
                  />
                );
              })}
            </Pile>
          </DayRow>
        );
      })}
    </Archive>
  );
}

function FilterSurface({ state }: { readonly state: FilterState }) {
  const filters = FILTERS[state];
  const count = RESULT_COUNTS[state];
  const active = isActive(filters);
  const hasResults = state !== "open" && state !== "none";

  return (
    <>
      <TopBar back="Back to the pile" />

      {active ? (
        <FilterStrip
          count={count}
          onClear={() => {
            return undefined;
          }}
        >
          {filters.people.map((person) => {
            return (
              <Chip
                key={person}
                onPanel
                onRemove={() => {
                  return undefined;
                }}
                removeLabel={`Stop filtering by ${person}`}
              >
                {person}
              </Chip>
            );
          })}
          {filters.tags.map((tag) => {
            return (
              <Chip
                key={tag}
                onPanel
                onRemove={() => {
                  return undefined;
                }}
                removeLabel={`Stop filtering by ${tag}`}
              >
                {tag}
              </Chip>
            );
          })}
          {filters.from === undefined ? null : (
            <Chip
              onPanel
              onRemove={() => {
                return undefined;
              }}
              removeLabel="Clear the dates"
            >
              1 Sep to 30 Sep 2026
            </Chip>
          )}
        </FilterStrip>
      ) : null}

      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Sheet wide label="Find something">
            <Stack gap="md">
              <LabelText component="h2">Find something</LabelText>
              <TextInput
                label="Words in a tag or a name"
                placeholder="hospital, Abuela, first steps"
                leftSection={<IconSearch {...ICON_PROPS} />}
                defaultValue={filters.tags[0] ?? ""}
              />

              <Stack gap="xs">
                <LabelText component="h3">Who is in it</LabelText>
                <ChipRow>
                  {PEOPLE.filter((person) => {
                    return person.itemCount > 0;
                  })
                    .slice(0, 8)
                    .map((person, index) => {
                      const chosen = filters.people.includes(person.name);
                      const shown = chosen
                        ? person.itemCount
                        : active
                          ? narrowedCount(person.itemCount, count, index + 3)
                          : person.itemCount;
                      return (
                        <Chip
                          key={person.id}
                          active={chosen}
                          quiet={shown === 0}
                        >
                          {person.name}
                          {chosen ? null : (
                            <>
                              {" "}
                              <span className={classes.tabular}>
                                {shown.toLocaleString("en-GB")}
                              </span>
                            </>
                          )}
                        </Chip>
                      );
                    })}
                </ChipRow>
                {active ? (
                  <Prose>
                    Each number is what you would be left with after adding that
                    one, not what it is worth on its own. So a nought is visible
                    before you press it rather than after.
                  </Prose>
                ) : null}
              </Stack>

              <Stack gap="xs">
                <LabelText component="h3">Tags</LabelText>
                <ChipRow>
                  {TAGS.slice(0, 9).map((tag, index) => {
                    const chosen = filters.tags.includes(tag.name);
                    const shown = chosen
                      ? tag.itemCount
                      : active
                        ? narrowedCount(tag.itemCount, count, index)
                        : tag.itemCount;
                    return (
                      <Chip key={tag.id} active={chosen} quiet={shown === 0}>
                        {tag.name}
                        {chosen ? null : (
                          <>
                            {" "}
                            <span className={classes.tabular}>
                              {shown.toLocaleString("en-GB")}
                            </span>
                          </>
                        )}
                      </Chip>
                    );
                  })}
                </ChipRow>
              </Stack>

              <Stack gap="xs">
                <LabelText component="h3">When</LabelText>
                <ChipRow>
                  <TextInput
                    type="date"
                    label="From"
                    defaultValue={filters.from ?? ""}
                  />
                  <TextInput
                    type="date"
                    label="Until"
                    defaultValue={filters.until ?? ""}
                  />
                </ChipRow>
                <Prose>
                  Dates are capture dates, not upload dates. A photograph taken
                  in 2019 and put up last week sits in 2019, where you would
                  look for it.
                </Prose>
              </Stack>
            </Stack>
          </Sheet>

          {state === "open" ? (
            <Prose onPanel>
              Nothing chosen yet, so this is the whole archive: 2,147 photos and
              videos across 948 days. Pick a person, a tag or a stretch of time
              and the pile below narrows to it.
            </Prose>
          ) : null}

          {state === "none" ? (
            <Stack gap="md">
              <Lede>Nothing matches all three.</Lede>
              <Prose onPanel>
                Elena is in 23 photographs and there are 141 tagged <b>beach</b>
                , but none of them are the same ones, and none are in September.
                Take one filter off and it will find something.
              </Prose>
              <ChipRow>
                <Button variant="panel">Drop the dates</Button>
                <Button variant="panel">Drop beach</Button>
                <Button variant="panel">Clear all three</Button>
              </ChipRow>
              <Ghosts />
            </Stack>
          ) : null}
        </Stack>
      </main>

      {hasResults ? (
        <Results
          days={narrowDays(ARCHIVE_DAYS.slice(1, 3), count)}
          countLabel={state === "person" ? "with her" : "matching"}
        />
      ) : null}
    </>
  );
}

export const filterSurface: Surface = {
  id: "filter",
  number: 6,
  title: "Filter and search",
  who: "every member",
  group: "member",
  blurb:
    "The common question is what somebody looked like last summer, and it has to be answerable without anyone having tidied up first.",
  states: [
    {
      id: "open",
      label: "Nothing chosen",
      note: "Opens on the whole archive rather than an empty results page. The counts beside each chip say what pressing it is worth.",
      render: () => {
        return <FilterSurface state="open" />;
      },
    },
    {
      id: "tag",
      label: "By tag",
      note: "One tag, and the result is the pile again: same spine, same prints, same stacks. A filtered archive is not a different object.",
      render: () => {
        return <FilterSurface state="tag" />;
      },
    },
    {
      id: "person",
      label: "By person",
      note: "Filtering by a person is the path, and there is no per-person page to land on. The spine's unit word changes to say so.",
      render: () => {
        return <FilterSurface state="person" />;
      },
    },
    {
      id: "dates",
      label: "By date range",
      note: "Native date inputs, because the audience skews older and a native affordance beats an invented calendar.",
      render: () => {
        return <FilterSurface state="dates" />;
      },
    },
    {
      id: "several",
      label: "Several at once",
      note: "Every filter shows as a chip carrying its own way out, so nothing is ever on without being visible.",
      render: () => {
        return <FilterSurface state="several" />;
      },
    },
    {
      id: "none",
      label: "No results",
      note: "Says which filter is doing the excluding and offers to drop it. A bare no-results page leaves people stuck.",
      render: () => {
        return <FilterSurface state="none" />;
      },
    },
  ],
};
