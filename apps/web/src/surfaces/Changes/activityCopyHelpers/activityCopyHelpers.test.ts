import { describe, expect, it } from "vitest";
import { makeActivityEntryFromOverrides } from "@/surfaces/Presence/__tests__/observationFixtureHelpers";
import {
  activitySentence,
  makeActivityDaysFromEntries,
} from "./activityCopyHelpers";

describe("delivered history vocabulary", () => {
  it.each([
    [
      "sign_in_code_requested",
      "requested a sign-in code for The old photograph.",
    ],
    ["signed_in", "signed in: The old photograph."],
    ["sign_in_failed", "had a failed sign-in attempt: The old photograph."],
    ["signed_out", "signed out: The old photograph."],
    ["device_revoked", "signed out a device remotely: The old photograph."],
    ["session_expired", "had a session expire: The old photograph."],
    ["member_invited", "invited The old photograph."],
    ["invitation_revoked", "revoked the invitation for The old photograph."],
    ["invitation_accepted", "accepted the invitation for The old photograph."],
    ["member_role_changed", "changed the role of The old photograph."],
    ["member_removed", "removed The old photograph from the Shoebox."],
    ["group_created", "created the group The old photograph."],
    ["group_renamed", "renamed the group The old photograph."],
    ["group_membership_changed", "changed membership of The old photograph."],
    ["group_deleted", "deleted the group The old photograph."],
    ["item_visibility_changed", "changed who can see The old photograph."],
    ["setting_changed", "changed the setting The old photograph."],
    ["item_deleted", "deleted The old photograph."],
    ["comment_deleted", "deleted the comment The old photograph."],
    [
      "milestone_deleted",
      "deleted the milestone The old photograph. Its photographs stayed.",
    ],
    ["constructor", "recorded a change to The old photograph (constructor)."],
    ["__proto__", "recorded a change to The old photograph (__proto__)."],
    ["future_event", "recorded a change to The old photograph (future_event)."],
  ])("describes %s without inventing uncontracted detail", (kind, sentence) => {
    expect(activitySentence(makeActivityEntryFromOverrides({ kind }))).toBe(
      sentence,
    );
  });
  it("includes the recorded role transition in the sentence", () => {
    expect(
      activitySentence(
        makeActivityEntryFromOverrides({
          kind: "member_role_changed",
          detail: {
            kind: "member_role_changed",
            fromRole: "viewer",
            toRole: "admin",
          },
        }),
      ),
    ).toContain("from viewer to admin");
  });
  it("includes added and removed member labels in the sentence", () => {
    expect(
      activitySentence(
        makeActivityEntryFromOverrides({
          kind: "group_membership_changed",
          detail: {
            kind: "group_membership_changed",
            addedLabels: ["Inés", "Rosa"],
            removedLabels: ["Rafa"],
          },
        }),
      ),
    ).toBe(
      "changed membership of The old photograph. Added Inés, Rosa. Removed Rafa.",
    );
  });
  it("includes the recorded visibility transition in the sentence", () => {
    expect(
      activitySentence(
        makeActivityEntryFromOverrides({
          kind: "item_visibility_changed",
          detail: {
            kind: "item_visibility_changed",
            fromLabel: "primos",
            toLabel: "everybody",
          },
        }),
      ),
    ).toContain("from primos to everybody");
  });
  it("states when earlier and later visibility labels were not recorded", () => {
    expect(
      activitySentence(
        makeActivityEntryFromOverrides({
          kind: "item_visibility_changed",
          detail: {
            kind: "item_visibility_changed",
            fromLabel: null,
            toLabel: null,
          },
        }),
      ),
    ).toContain("Earlier and later visibility labels were not recorded");
  });
  it("includes the recorded setting values in the sentence", () => {
    expect(
      activitySentence(
        makeActivityEntryFromOverrides({
          kind: "setting_changed",
          detail: {
            kind: "setting_changed",
            settingKey: "legacy.key",
            fromValue: null,
            toValue: "new",
          },
        }),
      ),
    ).toContain("legacy.key from unset to new");
  });
  it.each([
    [
      null,
      "Only the cousins",
      "changed who can see The old photograph, from an unrecorded earlier visibility to Only the cousins.",
    ],
    [
      "Only the cousins",
      null,
      "changed who can see The old photograph, from Only the cousins to an unrecorded later visibility.",
    ],
  ])(
    "preserves a surviving historical visibility label (%s -> %s)",
    (fromLabel, toLabel, sentence) => {
      expect(
        activitySentence(
          makeActivityEntryFromOverrides({
            kind: "item_visibility_changed",
            detail: { kind: "item_visibility_changed", fromLabel, toLabel },
          }),
        ),
      ).toBe(sentence);
    },
  );
  it("groups appended pages by Shoebox local day around midnight and DST", () => {
    const entries = [
      makeActivityEntryFromOverrides(),
      makeActivityEntryFromOverrides({
        entryId: "older",
        occurredAt: "2026-09-16T23:50:00.000Z",
      }),
      makeActivityEntryFromOverrides({
        entryId: "oldest",
        occurredAt: "2026-09-16T20:50:00.000Z",
      }),
    ];
    const days = makeActivityDaysFromEntries({
      entries,
      timezone: "Europe/Madrid",
    });
    expect(
      days.map((day) => {
        return [
          day.day,
          day.entries.map((entry) => {
            return entry.entryId;
          }),
        ];
      }),
    ).toEqual([
      ["2026-09-17", [entries[0]?.entryId, "older"]],
      ["2026-09-16", ["oldest"]],
    ]);
    const retreat = [
      makeActivityEntryFromOverrides({
        occurredAt: "2026-11-01T05:30:00.000Z",
      }),
      makeActivityEntryFromOverrides({
        occurredAt: "2026-11-01T06:30:00.000Z",
      }),
    ];
    expect(
      makeActivityDaysFromEntries({
        entries: retreat,
        timezone: "America/New_York",
      }),
    ).toHaveLength(1);
  });
});
