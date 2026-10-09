import type { PersonInput, PersonRef } from "@memory-shoebox/shared";
import type { PersonChoice } from "@/system/PeopleField/PeopleField";
import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";

/** Keeps chosen identities while matching unsaved names after queued saves. */
export function makePeopleInputsFromChoices(
  options: Readonly<{
    choices: readonly PersonChoice[];
    known: readonly PersonRef[];
  }>,
): PersonInput[] {
  const usedIds = new Set(
    options.choices.flatMap((choice) => {
      return choice.personId ? [choice.personId] : [];
    }),
  );
  return options.choices.map((choice) => {
    if (choice.personId) {
      return { personId: choice.personId };
    }
    const matched = options.known.find((person) => {
      return (
        !usedIds.has(person.personId) &&
        makeNameKeyFromName(person.displayName) ===
          makeNameKeyFromName(choice.displayName)
      );
    });
    if (matched) {
      usedIds.add(matched.personId);
      return { personId: matched.personId };
    }
    return { displayName: choice.displayName.trim().normalize("NFC") };
  });
}
