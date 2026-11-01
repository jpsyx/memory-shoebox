import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";
import { personLabel } from "@/system/personLabel/personLabel";
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
  }: Readonly<{ name: string; personId: string; index?: number }>) => void;
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
  return names.map((name, index) => {
    const selected = people.find((entry) => {
      return entry.person.personId === choices[String(index)];
    });
    if (selected?.person.isMember) {
      return null;
    }
    const matches = people.filter((entry) => {
      return (
        !entry.person.isMember &&
        makeNameKeyFromName(entry.person.displayName) ===
          makeNameKeyFromName(name)
      );
    });
    return matches.length < 2 ? null : (
      <Select
        key={`${name}-${index}`}
        label={`Which ${name}?`}
        description="Several people share this name. Choose the person to tag."
        placeholder="Choose a person"
        disabled={isDisabled}
        value={choices[String(index)] ?? null}
        onChange={(personId) => {
          if (personId) {
            onChoose({ name, personId, index });
          }
        }}
        data={matches.map((entry) => {
          return {
            value: entry.person.personId,
            label: `${personLabel(entry.person)}, ${entry.itemCount} photographs`,
          };
        })}
      />
    );
  });
}
