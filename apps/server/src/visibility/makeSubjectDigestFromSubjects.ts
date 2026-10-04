import { createHash } from "node:crypto";
import type { ResolveVisibilityRuleRequest } from "@memory-shoebox/shared";

/** Hashes the canonical deduplicated subject set; empty sets carry ''. */
export function makeSubjectDigestFromSubjects(
  subjects: ReadonlyArray<ResolveVisibilityRuleRequest["subjects"][number]>,
): string {
  const canonical = [
    ...new Map(
      subjects.map((subject) => {
        return [`${subject.kind}:${subject.id}`, subject] as const;
      }),
    ).values(),
  ].sort((left, right) => {
    return (
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
    );
  });
  return canonical.length === 0
    ? ""
    : createHash("sha256")
        .update(
          canonical
            .map((subject) => {
              return `${subject.kind}:${subject.id}`;
            })
            .join("\n"),
        )
        .digest("hex");
}
