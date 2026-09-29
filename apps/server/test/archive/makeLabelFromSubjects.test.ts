import { describe, expect, it } from "vitest";
import {
  makeLabelFromSubjects,
  type RuleSubject,
} from "../../src/archive/makeLabelFromSubjects.ts";

const GROUP: RuleSubject = {
  kind: "group",
  id: "group-1",
  displayName: "Just us two",
};

const OTHER_GROUP: RuleSubject = {
  kind: "group",
  id: "group-2",
  displayName: "Cousins",
};

const MEMBER: RuleSubject = {
  kind: "member",
  id: "member-1",
  displayName: "Abuela",
};

describe("makeLabelFromSubjects", () => {
  it("labels one group with mode only as that group's name", () => {
    expect(makeLabelFromSubjects({ mode: "only", subjects: [GROUP] })).toBe(
      "Just us two",
    );
  });

  it("leaves one group with mode except unlabelled, because the name would invert", () => {
    expect(
      makeLabelFromSubjects({ mode: "except", subjects: [GROUP] }),
    ).toBeNull();
  });

  it("leaves one member with mode only unlabelled: a group name is what earns the shortcut", () => {
    expect(
      makeLabelFromSubjects({ mode: "only", subjects: [MEMBER] }),
    ).toBeNull();
  });

  it("leaves two groups with mode only unlabelled, because there is no single name to show", () => {
    expect(
      makeLabelFromSubjects({
        mode: "only",
        subjects: [GROUP, OTHER_GROUP],
      }),
    ).toBeNull();
  });

  it("leaves no subjects at all unlabelled", () => {
    expect(makeLabelFromSubjects({ mode: "only", subjects: [] })).toBeNull();
  });
});
