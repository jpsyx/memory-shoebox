import { describe, expect, it } from "vitest";
import type { VisibilitySummary } from "@memory-shoebox/shared";
import {
  isSameVisibility,
  makePickerOptionsFromSources,
  makeResolveRequestFromChoice,
} from "@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers";
import { SIGNED_IN } from "@/testing/itemFixtureHelpers";

const TIA = {
  memberId: "018f0000-0000-7000-8000-00000000c003",
  displayName: "Tía Marisol",
};
const COUSINS_ID = "018f0000-0000-7000-8000-0000000a0002";

const ONLY_TIA_AND_COUSINS: VisibilitySummary = {
  visibilityRuleId: "018f0000-0000-7000-8000-0000000a0101",
  mode: "only",
  label: null,
  subjects: [
    { kind: "member", id: TIA.memberId, displayName: TIA.displayName },
    { kind: "group", id: COUSINS_ID, displayName: "Cousins" },
  ],
};

describe("makePickerOptionsFromSources", () => {
  it("offers what the rule already names, and the viewer, with no lists at all", () => {
    expect(
      makePickerOptionsFromSources({
        members: undefined,
        groups: undefined,
        visibility: ONLY_TIA_AND_COUSINS,
        viewer: SIGNED_IN,
      }),
    ).toEqual({
      members: [TIA, SIGNED_IN],
      groups: [{ groupId: COUSINS_ID, name: "Cousins" }],
    });
  });

  it("prefers the fetched rows, which know a role and a size", () => {
    const options = makePickerOptionsFromSources({
      members: {
        shape: "admin",
        members: [{ ...TIA, role: "viewer" }],
        nextCursor: null,
      },
      groups: {
        shape: "admin",
        groups: [
          { groupId: COUSINS_ID, name: "Cousins", members: [TIA, SIGNED_IN] },
        ],
        nextCursor: null,
      },
      visibility: ONLY_TIA_AND_COUSINS,
      viewer: SIGNED_IN,
    });
    expect(options.members).toEqual([{ ...TIA, role: "viewer" }, SIGNED_IN]);
    expect(options.groups).toEqual([
      { groupId: COUSINS_ID, name: "Cousins", memberCount: 2 },
    ]);
  });
});

describe("isSameVisibility", () => {
  it("ignores the order the subjects were chosen in", () => {
    expect(
      isSameVisibility({
        visibility: ONLY_TIA_AND_COUSINS,
        mode: "only",
        subjectIds: [COUSINS_ID, TIA.memberId],
      }),
    ).toBe(true);
  });

  it("reads Except with nobody named as Everyone, as the server does", () => {
    const everyone: VisibilitySummary = {
      visibilityRuleId: "visibility-rule-everyone",
      mode: "everyone",
      label: null,
      subjects: [],
    };
    expect(
      isSameVisibility({
        visibility: everyone,
        mode: "except",
        subjectIds: [],
      }),
    ).toBe(true);
    expect(
      isSameVisibility({
        visibility: everyone,
        mode: "except",
        subjectIds: [TIA.memberId],
      }),
    ).toBe(false);
  });
});

describe("makeResolveRequestFromChoice", () => {
  it("names each subject's kind from the groups it knows", () => {
    expect(
      makeResolveRequestFromChoice({
        mode: "except",
        subjectIds: [TIA.memberId, COUSINS_ID],
        groups: [{ groupId: COUSINS_ID, name: "Cousins" }],
      }),
    ).toEqual({
      mode: "except",
      subjects: [
        { kind: "member", id: TIA.memberId },
        { kind: "group", id: COUSINS_ID },
      ],
    });
  });

  it("sends Everyone with no subjects, whatever the field still holds", () => {
    expect(
      makeResolveRequestFromChoice({
        mode: "everyone",
        subjectIds: [TIA.memberId],
        groups: [],
      }),
    ).toEqual({ mode: "everyone", subjects: [] });
  });
});
