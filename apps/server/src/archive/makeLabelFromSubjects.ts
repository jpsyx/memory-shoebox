import type { VisibilitySummary } from "@memory-shoebox/shared";

/** One subject of one rule, as the interface draws it. */
export type RuleSubject = {
  kind: "member" | "group";
  id: string;
  displayName: string;
};

/**
 * The words on the lock chip, or nothing.
 *
 * A rule whose whole subject set is **one group** is that group's name: "Just
 * us two" is a group in the fixtures, and it reads better than the list the
 * client would otherwise assemble. Everything else is null, and `apps/web`'s
 * `visibilityLabel` assembles "Only Papá, Mamá" from the subjects.
 *
 * `except` gets null too, and that is the point of the mode check rather than
 * an oversight: a bare "Just us two" on a rule meaning everyone **except**
 * those two says the opposite of what it means. The client prints "Everyone
 * except Cousins" instead, which is correct and is already built.
 *
 * The one genuinely pure decision in this module: no database, no async, just
 * a mode and a subject list in, a label or null out. Exported so it can be
 * tested directly rather than only through {@link readVisibilitySummaries}.
 */
export function makeLabelFromSubjects(options: {
  mode: VisibilitySummary["mode"];
  subjects: readonly RuleSubject[];
}): string | null {
  const [only] = options.subjects;
  return options.mode === "only" &&
    options.subjects.length === 1 &&
    only?.kind === "group"
    ? only.displayName
    : null;
}
