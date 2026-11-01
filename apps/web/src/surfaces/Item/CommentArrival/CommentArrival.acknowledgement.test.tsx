import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import {
  ITEM_ID,
  makeItemDetail,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import { respondWithItem } from "@/testing/itemHarnessHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { renderAt } from "@/testing/surfaceHarnessHelpers";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { collectionRoutes, comment } from "./commentArrivalTestHelpers";

it.each(["main", "reply"] as const)(
  "clears only the submitted %s revision when a send succeeds while away",
  async (mode) => {
    const hold = makeHold();
    const detail = makeVideoDetail({ comments: [comment] });
    respondWithItem({
      detail,
      routes: {
        ...collectionRoutes,
        [`POST /api/items/${ITEM_ID}/comments`]: {
          status: 201,
          body: { ...comment, body: "Sent words", commentTags: [] },
          waitFor: hold.hold,
        },
      },
    });
    renderAt(`/items/${ITEM_ID}`);
    await screen.findByRole("textbox", { name: "Write a comment" });
    if (mode === "reply") {
      fireEvent.click(
        screen.getByRole("button", {
          name: `Reply to ${comment.author.displayName}`,
        }),
      );
    }
    const field = screen.getByRole("textbox", {
      name:
        mode === "main"
          ? "Write a comment"
          : `Reply to ${comment.author.displayName}`,
    });
    fireEvent.change(field, { target: { value: "Sent words" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: mode === "main" ? "Post comment" : "Post reply",
      }),
    );
    await waitFor(() => {
      return expect(
        getRecordedRequests().some((request) => {
          return request.method === "POST";
        }),
      ).toBe(true);
    });
    fireEvent.change(field, { target: { value: "Newer words" } });
    fireEvent.click(
      screen.getByRole("link", { name: "Jorge, view photos and videos" }),
    );
    await screen.findByRole("link", { name: "Back to comment" });
    await act(async () => {
      return hold.letGo();
    });
    fireEvent.click(screen.getByRole("link", { name: "Back to comment" }));
    expect(
      await screen.findByRole("textbox", {
        name:
          mode === "main"
            ? "Write a comment"
            : `Reply to ${comment.author.displayName}`,
      }),
    ).toHaveValue("Newer words");
  },
);

it("retains saved tag IDs after an actual pending edit departs and returns", async () => {
  const hold = makeHold();
  const own = {
    ...comment,
    author: SIGNED_IN,
    canEdit: true,
    body: "Own words",
    commentTags: [],
  };
  const detail = makeItemDetail({
    comments: [
      own,
      { ...comment, commentId: "00000000-0000-4000-8000-000000000008" },
    ],
  });
  const member = { ...SIGNED_IN, displayName: "Jorge" };
  respondWithItem({
    detail,
    routes: {
      ...collectionRoutes,
      [`GET /api/items/${ITEM_ID}/comment-tag-candidates`]: {
        status: 200,
        body: { members: [member] },
      },
      [`PATCH /api/comments/${own.commentId}`]: {
        status: 200,
        body: { ...own, body: "Hi @Jorge", commentTags: comment.commentTags },
        waitFor: hold.hold,
      },
    },
  });
  renderAt(`/items/${ITEM_ID}`);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const field = screen.getByRole("textbox", { name: "What you wrote" });
  fireEvent.change(field, {
    target: { value: "Hi @J", selectionStart: 5, selectionEnd: 5 },
  });
  fireEvent.click(await screen.findByRole("option", { name: "Jorge" }));
  fireEvent.click(screen.getByRole("button", { name: "Save the change" }));
  await waitFor(() => {
    return expect(
      getRecordedRequests().some((request) => {
        return request.method === "PATCH";
      }),
    ).toBe(true);
  });
  fireEvent.change(field, {
    target: { value: "Wow Hi @Jorge ", selectionStart: 4, selectionEnd: 4 },
  });
  fireEvent.click(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  );
  await screen.findByRole("link", { name: "Back to comment" });
  await act(async () => {
    return hold.letGo();
  });
  fireEvent.click(screen.getByRole("link", { name: "Back to comment" }));
  const restored = await screen.findByRole("textbox", {
    name: "What you wrote",
  });
  expect(restored).toHaveValue("Wow Hi @Jorge ");
  fireEvent.click(screen.getByRole("button", { name: "Save the change" }));
  await waitFor(() => {
    return expect(
      getRecordedRequests().filter((request) => {
        return request.method === "PATCH";
      }),
    ).toHaveLength(2);
  });
  expect(
    getRecordedRequests()
      .filter((request) => {
        return request.method === "PATCH";
      })
      .at(-1)?.body,
  ).toMatchObject({
    commentTags: [{ tagId: comment.commentTags[0]!.tagId, start: 7, end: 13 }],
  });
});

it("keeps a remounted edit busy until its original save settles", async () => {
  const hold = makeHold();
  const own = { ...comment, author: SIGNED_IN, canEdit: true };
  const detail = makeItemDetail({
    comments: [
      own,
      { ...comment, commentId: "00000000-0000-4000-8000-000000000008" },
    ],
  });
  respondWithItem({
    detail,
    routes: {
      ...collectionRoutes,
      [`PATCH /api/comments/${own.commentId}`]: {
        status: 200,
        body: own,
        waitFor: hold.hold,
      },
    },
  });
  renderAt(`/items/${ITEM_ID}`);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByRole("textbox", { name: "What you wrote" }), {
    target: { value: "New words" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save the change" }));
  await waitFor(() => {
    expect(
      getRecordedRequests().filter((request) => {
        return request.method === "PATCH";
      }),
    ).toHaveLength(1);
  });
  fireEvent.click(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  );
  fireEvent.click(await screen.findByRole("link", { name: "Back to comment" }));
  const save = await screen.findByRole("button", { name: "Saving" });
  expect(save).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(save);
  await act(async () => {
    hold.letGo();
  });
  expect(
    getRecordedRequests().filter((request) => {
      return request.method === "PATCH";
    }),
  ).toHaveLength(1);
});
