import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";
import { Select } from "@mantine/core";
import type { DirectoryPerson } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = {
  names: readonly string[];
  people: readonly DirectoryPerson[];
  choices: Readonly<Record<string, string>>;
  onChoose: ({
    name,
    personId,
  }: Readonly<{ name: string; personId: string }>) => void;
  isDisabled: boolean;
};
/** Requires an id-valued choice when multiple people share the typed name. */
export function UploadPersonChoice({
  names,
  people,
  choices,
  onChoose,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return names.map((name) => {
    const matches = people.filter((entry) => {
      return (
        makeNameKeyFromName(entry.person.displayName) ===
        makeNameKeyFromName(name)
      );
    });
    return matches.length < 2 ? null : (
      <Select
        key={name}
        label={`Which ${name}?`}
        description="Several people share this name. Choose the person to tag."
        placeholder="Choose a person"
        disabled={isDisabled}
        value={choices[name] ?? null}
        onChange={(personId) => {
          if (personId) {
            onChoose({ name: name, personId: personId });
          }
        }}
        data={matches.map((entry) => {
          return {
            value: entry.person.personId,
            label: `${entry.person.displayName}, ${entry.itemCount} photographs (${entry.person.personId})`,
          };
        })}
      />
    );
  });
}
