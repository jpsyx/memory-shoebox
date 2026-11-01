import { describe, expect, it } from "vitest";
import {
  createConversationJourney,
  getCommentSearchFromSearch,
  isSameTabActivation,
  type DraftKey,
} from "./conversationJourneyHelpers";
import { makeCommentTagFromSource } from "@/system/commentDraftHelpers/commentTagProvenance";
const draft = {
  body: "Hi @Jorge",
  commentTags: [{ memberId: "member", start: 3, end: 9 }],
  selectionStart: 3,
  selectionEnd: 9,
  atSeconds: 6.25,
  hasStarted: true,
};
const journey = {
  itemId: "item",
  memberId: "member",
  href: "/items/item",
  scrollContainer: "comments",
  scrollTop: 231,
  theater: "window",
} as const;
describe("conversation journey", () => {
  it.each(["main", "reply", "edit"] as const)(
    "retains %s values, conditional clearing and item retirement",
    (mode) => {
      const memory = createConversationJourney();
      const key: DraftKey =
        mode === "main"
          ? { itemId: "item", mode }
          : { itemId: "item", mode, commentId: "comment" };
      memory.writeDraft(key, draft);
      const submitted = memory.readDraft(key)!;
      expect(submitted).toMatchObject(draft);
      memory.writeDraft(key, { ...draft, body: "Newer words" });
      memory.removeDraft(key, submitted.revision);
      expect(memory.readDraft(key)?.body).toBe("Newer words");
      memory.rememberReturn(journey);
      expect(memory.readReturn()?.scrollTop).toBe(231);
      memory.retireItem("item");
      expect(memory.readDraft(key)).toBeUndefined();
      expect(memory.readReturn()).toBeUndefined();
    },
  );
  it("retires captured actions and replaces the single return", () => {
    let current = true;
    const old = createConversationJourney(() => {
      return current;
    });
    old.rememberReturn(journey);
    old.rememberReturn({ ...journey, itemId: "other" });
    expect(old.readReturn()?.itemId).toBe("other");
    current = false;
    old.writeDraft({ itemId: "item", mode: "main" }, draft);
    old.rememberReturn(journey);
    expect(old.readDraft({ itemId: "item", mode: "main" })).toBeUndefined();
    expect(old.readReturn()).toBeUndefined();
  });
  it("hydrates surviving and undo occurrences after an away-visit acknowledgement", () => {
    const memory = createConversationJourney();
    const key = { itemId: "item", mode: "edit", commentId: "comment" } as const;
    memory.writeDraft(key, draft);
    const submitted = memory.readDraft(key)!;
    memory.writeDraft(key, {
      ...draft,
      body: `Wow ${draft.body}`,
      commentTags: [
        makeCommentTagFromSource({
          source: draft.commentTags[0]!,
          changes: { start: 7, end: 13 },
        }),
      ],
    });
    memory.acknowledge(key, submitted, [
      { ...draft.commentTags[0]!, label: "Jorge", tagId: "saved" },
    ]);
    expect(memory.readDraft(key)?.commentTags[0]).toMatchObject({
      start: 7,
      tagId: "saved",
    });
    memory.writeDraft(key, draft);
    expect(memory.readDraft(key)?.commentTags[0]?.tagId).toBe("saved");
    memory.writeDraft(key, {
      ...draft,
      commentTags: [{ ...draft.commentTags[0]! }],
    });
    expect(memory.readDraft(key)?.commentTags[0]?.tagId).toBeUndefined();
  });
  it("keeps only UUID comment search and native modified-click semantics", () => {
    const comment = "00000000-0000-4000-8000-000000000001";
    expect(getCommentSearchFromSearch({ comment, draft: "secret" })).toEqual({
      comment,
    });
    expect(getCommentSearchFromSearch({ comment: "bad" })).toEqual({});
    const click = {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
    };
    expect(isSameTabActivation(click)).toBe(true);
    expect(isSameTabActivation({ ...click, metaKey: true })).toBe(false);
    expect(isSameTabActivation({ ...click, button: 1 })).toBe(false);
  });
});
