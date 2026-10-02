import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/client/client";
import {
  burstLeavingProse,
  captureSourceProse,
  commentSendFailure,
  commentsHeading,
  deleteItemProse,
  deleteReasonProse,
  describeProse,
  itemHeading,
  itemWriteFailure,
  kindNoun,
  removalAskProse,
  visibilityProse,
} from "@/surfaces/Item/itemCopy/itemCopy";
import { makeComment } from "@/testing/itemFixtures";

/** A refusal the way `apiFetch` throws one. */
function _refusal(options: {
  status: number;
  code: string;
  retryAfterSeconds?: number;
}): ApiRequestError {
  return new ApiRequestError({
    status: options.status,
    code: options.code,
    message: "refused",
    details:
      options.retryAfterSeconds === undefined
        ? undefined
        : { retryAfterSeconds: options.retryAfterSeconds },
  });
}

describe("kindNoun and itemHeading", () => {
  it("names the kind", () => {
    expect(kindNoun("photo")).toBe("photograph");
    expect(kindNoun("video")).toBe("video");
  });

  it("gives the page a heading a screen reader can land on", () => {
    expect(itemHeading({ kind: "photo", capturedOn: "2026-09-14" })).toBe(
      "A photograph from 14 September 2026",
    );
  });
});

describe("commentsHeading", () => {
  it("says nothing has been said when nothing has", () => {
    expect(commentsHeading({ kind: "photo", comments: [] })).toBe(
      "Nothing said yet",
    );
  });

  it("counts one comment in the singular", () => {
    expect(commentsHeading({ kind: "photo", comments: [makeComment()] })).toBe(
      "1 comment",
    );
  });

  it("counts the pinned ones on a video, and only when there are some", () => {
    const comments = [
      makeComment(),
      makeComment({
        commentId: "018f0000-0000-7000-8000-00000000d102",
        atSeconds: 4,
      }),
    ];
    expect(commentsHeading({ kind: "video", comments })).toBe(
      "2 comments, 1 pinned to a moment",
    );
    expect(commentsHeading({ kind: "video", comments: [makeComment()] })).toBe(
      "1 comment",
    );
  });
});

describe("the failure sentences", () => {
  it("says a refused write is a change of rights, not a fault", () => {
    expect(
      itemWriteFailure(_refusal({ status: 403, code: "item_edit_forbidden" })),
    ).toBe(
      "You can no longer change this one. The page has caught up with what you may do.",
    );
  });

  it("says how long to wait when rate limited", () => {
    expect(
      itemWriteFailure(
        _refusal({ status: 429, code: "rate_limited", retryAfterSeconds: 12 }),
      ),
    ).toBe(
      "That did not go through: a lot has been sent from here just now. Wait 12 seconds and try again.",
    );
  });

  it("falls back to one plain sentence", () => {
    expect(itemWriteFailure(new Error("dropped"))).toBe(
      "That did not go through. Try again.",
    );
  });

  it("tells somebody their words are still there when a comment fails", () => {
    expect(commentSendFailure(new Error("dropped"))).toBe(
      "It did not send. It is still here, so try again.",
    );
    expect(
      commentSendFailure(
        _refusal({ status: 429, code: "rate_limited", retryAfterSeconds: 1 }),
      ),
    ).toBe(
      "It did not send: a lot has been said from here just now. Wait a second and send it again. It is still here.",
    );
  });
});

describe("the delete copy", () => {
  it("counts the comments that go with it", () => {
    expect(deleteItemProse({ commentCount: 3 })).toBe(
      "It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again, and the 3 comments on it go with it.",
    );
    expect(deleteItemProse({ commentCount: 1 })).toBe(
      "It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again, and the one comment on it goes with it.",
    );
    expect(deleteItemProse({ commentCount: 0 })).toBe(
      "It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again.",
    );
  });

  it("says why this viewer may delete it", () => {
    expect(deleteReasonProse({ isUploader: true })).toContain(
      "You uploaded this one",
    );
    expect(deleteReasonProse({ isUploader: false })).toContain(
      "You run the archive",
    );
  });
});

describe("the rest", () => {
  it("names who a removal request tells", () => {
    expect(removalAskProse("Mamá")).toBe(
      "You are tagged in this one. Asking tells Mamá, who put it up, and everyone who runs the archive.",
    );
  });

  it("does not tell 'everyone else' anything when it is everyone", () => {
    expect(visibilityProse({ kind: "photo", mode: "everyone" })).toBe(
      "Everybody in the Shoebox can open it.",
    );
    expect(visibilityProse({ kind: "video", mode: "only" })).toBe(
      "To everyone else this video is not there at all, and it is not counted in the day's total.",
    );
  });

  it("counts the frames a date move leaves behind", () => {
    expect(burstLeavingProse(45)).toMatch(
      /The other 44 stay where they are\.$/,
    );
    expect(burstLeavingProse(2)).toMatch(/The other one stays where it is\.$/);
  });

  it("says where the date came from, honestly", () => {
    expect(
      captureSourceProse({ kind: "photo", captureSource: "exif" }),
    ).toMatch(/^Read off the file itself\./);
    expect(
      captureSourceProse({ kind: "photo", captureSource: "uploader_set" }),
    ).toMatch(/^Put right by hand\./);
  });

  it("quotes the generated line only while there is one to quote", () => {
    expect(
      describeProse({ draft: "", generated: "Mateo, 14 September 2026" }),
    ).toContain("“Mateo, 14 September 2026”");
    expect(describeProse({ draft: "Papá in scrubs", generated: "x" })).toBe(
      "That is what gets read out. It replaces what we worked out on our own.",
    );
  });
});
