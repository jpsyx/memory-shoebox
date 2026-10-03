import type { PersonInput, PersonRef } from "@memory-shoebox/shared";
import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";

/**
 * The people set to send, from the names in the field.
 *
 * The field holds names, because it accepts one the archive has never heard
 * of. A name a known person carries goes as their id, so tagging "Mateo"
 * attaches the Mateo on 412 photographs rather than inventing a second one;
 * any other name goes as a name, and the server makes a person of it.
 *
 * Names are matched as `makeNameKeyFromName` reads them, so "mateo " is
 * Mateo. Each known person is used once, the first unused one carrying a name
 * winning, and the caller lists the item's own people first: a name already
 * on the item keeps the person it had, and two people on it who share a name
 * keep their own ids, in order. An empty name, and a repeat with nobody left
 * to stand for, are dropped rather than sent.
 */
export function makePeopleInputsFromNames(
  options: Readonly<{
    names: readonly string[];
    known: readonly PersonRef[];
  }>,
): PersonInput[] {
  const usedPersonIds = new Set<string>();
  const sentKeys = new Set<string>();
  return options.names.flatMap((name): PersonInput[] => {
    const key = makeNameKeyFromName(name);
    const person = options.known.find((candidate) => {
      return (
        !usedPersonIds.has(candidate.personId) &&
        makeNameKeyFromName(candidate.displayName) === key
      );
    });
    if (key === "" || (person === undefined && sentKeys.has(key))) {
      return [];
    }
    sentKeys.add(key);
    if (person === undefined) {
      return [{ displayName: name.trim().normalize("NFC") }];
    }
    usedPersonIds.add(person.personId);
    return [{ personId: person.personId }];
  });
}
