import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedCountFromLine,
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

const MINE = makeComment({
  author: SIGNED_IN,
  body: "He has his mother's chin.",
  canEdit: true,
  canDelete: true,
});

describe("the thread", () => {
  it("says nothing has been said and offers the composer when the thread is empty", async () => {
    respondWithItem({ detail: makeItemDetail() });
    renderItem(ITEM_ID);

    const talk = await screen.findByRole("region", { name: "Comments" });
    expect(
      within(talk).getByRole("heading", { name: "Nothing said yet" }),
    ).toBeVisible();
    expect(
      within(talk).getByRole("textbox", { name: "Say something" }),
    ).toBeVisible();
  });

  it("adds a comment to the thread without asking for the item again", async () => {
    respondWithItem({
      detail: makeItemDetail(),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: { body: MINE, status: 201 },
      },
    });
    renderItem(ITEM_ID);

    const field = await screen.findByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("He has his mother's chin.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "1 comment" })).toBeVisible();
    expect(field).toHaveValue("");
    expect(getRecordedCountFromLine(`GET /api/items/${ITEM_ID}`)).toBe(1);
  });

  it("keeps the words, and says how long to wait, when the send is refused", async () => {
    respondWithItem({
      detail: makeItemDetail(),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: {
          body: {
            error: "rate_limited",
            message: "x",
            details: { retryAfterSeconds: 30 },
          },
          status: 429,
        },
      },
    });
    renderItem(ITEM_ID);

    const field = await screen.findByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "Again!");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wait 30 seconds",
    );
    expect(field).toHaveValue("Again!");
  });

  it("edits your own comment, and says it was edited", async () => {
    respondWithItem({
      detail: makeItemDetail({ comments: [MINE] }),
      routes: {
        [`PATCH /api/comments/${MINE.commentId}`]: {
          body: {
            ...MINE,
            body: "His father's chin, then.",
            editedAt: "2026-09-14T06:00:00.000Z",
          },
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "What you wrote" });
    await userEvent.clear(field);
    await userEvent.type(field, "His father's chin, then.");
    await userEvent.click(
      screen.getByRole("button", { name: "Save the change" }),
    );

    expect(await screen.findByText(/His father's chin, then\./)).toBeVisible();
    expect(screen.getByText(/^edited /)).toBeVisible();
  });

  it("takes a deleted comment out of the thread", async () => {
    respondWithItem({
      detail: makeItemDetail({ comments: [MINE] }),
      routes: {
        [`DELETE /api/comments/${MINE.commentId}`]: {
          body: undefined,
          status: 204,
        },
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete it" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("He has his mother's chin.")).toBeNull();
    });
    expect(
      screen.getByRole("heading", { name: "Nothing said yet" }),
    ).toBeVisible();
  });

  it("puts focus in the composer once a deleted comment has gone", async () => {
    respondWithItem({
      detail: makeItemDetail({ comments: [MINE] }),
      routes: {
        [`DELETE /api/comments/${MINE.commentId}`]: {
          body: undefined,
          status: 204,
        },
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete it" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Say something" }),
      ).toHaveFocus();
    });
  });

  it("leaves focus alone when it moved on while the delete was out", async () => {
    let letTheDeleteLand = () => {};
    respondWithItem({
      detail: makeItemDetail({ comments: [MINE] }),
      routes: {
        [`DELETE /api/comments/${MINE.commentId}`]: {
          body: undefined,
          status: 204,
          waitFor: new Promise<void>((settle) => {
            letTheDeleteLand = settle;
          }),
        },
      },
    });
    renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete it" }),
    );
    const download = screen.getByRole("link", {
      name: "Download the original",
    });
    download.focus();
    letTheDeleteLand();

    await waitFor(() => {
      expect(screen.queryByText("He has his mother's chin.")).toBeNull();
    });
    expect(download).toHaveFocus();
  });

  it("sends a reaction on a comment to the comment's own route", async () => {
    const theirs = makeComment();
    respondWithItem({
      detail: makeItemDetail({ comments: [theirs] }),
      routes: {
        [`PUT /api/comments/${theirs.commentId}/reaction`]: {
          body: {
            kinds: [{ kind: "care", count: 1, members: [SIGNED_IN] }],
            myKind: "care",
          },
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);

    const talk = await screen.findByRole("region", { name: "Comments" });
    await userEvent.click(
      within(talk).getByRole("button", { name: /^React$/ }),
    );
    const picker = await screen.findByRole("dialog");
    await userEvent.click(within(picker).getByRole("button", { name: "Care" }));

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        `PUT /api/comments/${theirs.commentId}/reaction`,
      );
    });
  });
});
