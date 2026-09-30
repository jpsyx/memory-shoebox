import { Stack, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { PEOPLE, type Person } from "@/data/fixtures";
import { Banner, TopBar } from "@/system/Chrome";
import { ICON_PROPS } from "@/system/icons";
import { LabelText, Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type PeopleState = "all" | "zero" | "narrowed";

/**
 * One person in the directory.
 *
 * A member and a non-member are drawn identically on purpose. A grandmother
 * worth tracking in the archive need not hold an account, and marking who has
 * a login turns a directory of the family into a list of users.
 */
function PersonCard({ person }: { readonly person: Person }) {
  return (
    <button type="button" className={classes.personCard}>
      {person.face === null ? (
        <span className={`${classes.personFace} ${classes.personFaceEmpty}`} />
      ) : (
        <span className={classes.personFace}>
          <img src={person.face.thumb} alt="" loading="lazy" />
        </span>
      )}
      <span className={classes.personName}>{person.name}</span>
      <span className={classes.personCount}>
        {person.itemCount === 0
          ? "Nothing yet"
          : `${person.itemCount.toLocaleString("en-GB")} photos and videos`}
      </span>
    </button>
  );
}

function PeopleSurface({ state }: { readonly state: PeopleState }) {
  const people =
    state === "narrowed"
      ? PEOPLE.filter((person) => {
          return person.name.toLowerCase().includes("a");
        })
      : state === "zero"
        ? PEOPLE.filter((person) => {
            return person.itemCount === 0;
          })
        : PEOPLE;

  return (
    <>
      <TopBar back="Back to the pile" />
      <main className={classes.pageWide}>
        <Stack gap="md">
          <Lede>Everybody in the archive.</Lede>
          <Prose onPanel>
            Pressing a name filters the pile to the photographs and videos they
            are in. There is no page for a person: a person is a way into the
            archive, not a profile in it.
          </Prose>

          <TextInput
            label="Find somebody"
            placeholder="Start typing a name"
            leftSection={<IconSearch {...ICON_PROPS} />}
            defaultValue={state === "narrowed" ? "a" : ""}
          />

          {state === "zero" ? (
            <Banner onPanel>
              <b>Somebody here has been tagged but never photographed.</b> They
              were added so that the moment somebody puts up a photograph with
              them in it, it lands on a name that already exists rather than
              making a second one.
            </Banner>
          ) : null}

          <div>
            <LabelText component="h2">
              {state === "narrowed"
                ? `${people.length} of ${PEOPLE.length} people`
                : `${PEOPLE.length} people`}
            </LabelText>
            <div className={classes.peopleGrid}>
              {people.map((person) => {
                return <PersonCard key={person.id} person={person} />;
              })}
            </div>
          </div>

          <Prose onPanel>
            Some of these people can sign in and some cannot, and the directory
            does not say which. A tag says who is in a photograph; it never says
            who may open one.
          </Prose>
        </Stack>
      </main>
    </>
  );
}

export const peopleSurface: Surface = {
  id: "people",
  number: 7,
  title: "People directory",
  who: "every member",
  group: "member",
  blurb:
    "Everyone tagged in the archive, members and non-members drawn alike, as a way into the pile rather than a set of profiles.",
  states: [
    {
      id: "all",
      label: "Everybody",
      note: "Ten people, three of whom hold no account. Nothing on a card says which, because that is a permission fact and this is a family.",
      render: () => {
        return <PeopleSurface state="all" />;
      },
    },
    {
      id: "zero",
      label: "Nobody photographed yet",
      note: "A tagged person with no photographs gets the ghost frame the empty pile uses, and an explanation of why they exist at all.",
      render: () => {
        return <PeopleSurface state="zero" />;
      },
    },
    {
      id: "narrowed",
      label: "Narrowed by typing",
      note: "The count says how much of the directory is hidden, so nobody concludes a person has been removed.",
      render: () => {
        return <PeopleSurface state="narrowed" />;
      },
    },
  ],
};
