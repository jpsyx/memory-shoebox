import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  makeComment,
  makeItemDetail,
  ITEM_ID,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  makeHold,
  makeQueryClientFromItemDetail,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
import { stubFetch, getRecordedRequests } from "@/testing/fetchStubHelpers";
import { ItemComment } from "./ItemComment";
const comment = makeComment({
  author: SIGNED_IN,
  canEdit: true,
  body: "Hi @Jorge",
  commentTags: [
    {
      memberId: SIGNED_IN.memberId,
      tagId: "00000000-0000-4000-8000-000000000005",
      start: 3,
      end: 9,
      label: "Jorge",
    },
  ],
});
function setup() {
  const client = makeQueryClientFromItemDetail(
    makeItemDetail({ comments: [comment] }),
  );
  render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <ItemComment
          itemId={ITEM_ID}
          comment={comment}
          viewer={SIGNED_IN}
          canReply
          onFocusLost={vi.fn()}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  return vi.unstubAllGlobals();
});
it("saves retained IDs through the real edit hook and leaves newer editing open after late success", async () => {
  const hold = makeHold();
  stubFetch({
    [`PATCH /api/comments/${comment.commentId}`]: {
      status: 200,
      body: comment,
      waitFor: hold.hold,
    },
  });
  const client = setup();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const field = screen.getByRole("textbox", { name: "What you wrote" });
  fireEvent.change(field, {
    target: { value: "Wow Hi @Jorge", selectionStart: 4, selectionEnd: 4 },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Save the change" }),
  );
  await waitFor(() => {
    return expect(getRecordedRequests()).toHaveLength(1);
  });
  expect(getRecordedRequests()[0]?.body).toMatchObject({
    body: "Wow Hi @Jorge",
    commentTags: [{ ...comment.commentTags[0], start: 7, end: 13 }],
  });
  fireEvent.change(field, {
    target: {
      value: "Wow Hi @Jorge again",
      selectionStart: 19,
      selectionEnd: 19,
    },
  });
  await act(async () => {
    return hold.letGo();
  });
  await waitForWritesToSettle(client);
  expect(screen.getByRole("textbox", { name: "What you wrote" })).toHaveValue(
    "Wow Hi @Jorge again",
  );
});
it("offers per-occurrence correction from the real edit refusal and retries with explicit empty references", async () => {
  stubFetch({
    [`PATCH /api/comments/${comment.commentId}`]: {
      status: 409,
      body: {
        error: "comment_tag_unavailable",
        message: "private internal detail",
        details: {
          fieldErrors: { "commentTags.0": ["comment_tag_unavailable"] },
        },
      },
    },
    [`GET /api/items/${ITEM_ID}/comment-tag-candidates`]: {
      status: 200,
      body: { members: [] },
    },
  });
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const field = screen.getByRole("textbox", { name: "What you wrote" });
  fireEvent.change(field, {
    target: { value: "Hi @Jorge!", selectionStart: 10, selectionEnd: 10 },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Save the change" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Keep as plain text" }),
  );
  expect(field).toHaveValue("Hi @Jorge!");
  await userEvent.click(
    screen.getByRole("button", { name: "Save the change" }),
  );
  await waitFor(() => {
    return expect(
      getRecordedRequests().filter((request) => {
        return request.method === "PATCH";
      }),
    ).toHaveLength(2);
  });
  expect(
    getRecordedRequests().filter((request) => {
      return request.method === "PATCH";
    })[1]?.body,
  ).toEqual({ body: "Hi @Jorge!", commentTags: [] });
  expect(screen.queryByText("private internal detail")).not.toBeInTheDocument();
});
it("sends selected reply ranges and keeps a newer reply when the earlier post succeeds", async () => {
  const hold = makeHold();
  stubFetch({
    [`GET /api/items/${ITEM_ID}/comment-tag-candidates`]: {
      status: 200,
      body: { members: [{ ...SIGNED_IN, displayName: "Jorge" }] },
    },
    [`POST /api/items/${ITEM_ID}/comments`]: {
      status: 201,
      body: makeComment({ parentCommentId: comment.commentId }),
      waitFor: hold.hold,
    },
  });
  const client = setup();
  await userEvent.click(screen.getByRole("button", { name: /Reply to/ }));
  const field = screen.getByRole("textbox", { name: /Reply to/ });
  await userEvent.type(field, "@");
  await userEvent.click(await screen.findByRole("option", { name: "Jorge" }));
  await userEvent.click(screen.getByRole("button", { name: "Post reply" }));
  await waitFor(() => {
    return expect(
      getRecordedRequests().some((request) => {
        return request.method === "POST";
      }),
    ).toBe(true);
  });
  expect(
    getRecordedRequests().find((request) => {
      return request.method === "POST";
    })?.body,
  ).toMatchObject({
    body: "@Jorge ",
    commentTags: [{ memberId: SIGNED_IN.memberId, start: 0, end: 6 }],
    parentCommentId: comment.commentId,
  });
  await userEvent.type(field, "Newer words");
  await act(async () => {
    return hold.letGo();
  });
  await waitForWritesToSettle(client);
  expect(screen.getByRole("textbox", { name: /Reply to/ })).toHaveValue(
    "@Jorge Newer words",
  );
});

it("does not attach a late tag refusal to a replacement selection at the same index", async () => {
  const hold = makeHold();
  stubFetch({
    [`PATCH /api/comments/${comment.commentId}`]: {
      status: 409,
      waitFor: hold.hold,
      body: {
        error: "comment_tag_unavailable",
        message: "Unavailable",
        details: {
          fieldErrors: { "commentTags.0": ["comment_tag_unavailable"] },
        },
      },
    },
    [`GET /api/items/${ITEM_ID}/comment-tag-candidates`]: {
      status: 200,
      body: { members: [{ ...SIGNED_IN, displayName: "Jorge" }] },
    },
  });
  const client = setup();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const field = screen.getByRole("textbox", { name: "What you wrote" });
  fireEvent.change(field, {
    target: { value: "Hi @Jorge!", selectionStart: 10, selectionEnd: 10 },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Save the change" }),
  );
  await waitFor(() => {
    return expect(
      getRecordedRequests().some((request) => {
        return request.method === "PATCH";
      }),
    ).toBe(true);
  });
  await userEvent.clear(field);
  await userEvent.type(field, "Hi @");
  await userEvent.click(await screen.findByRole("option", { name: "Jorge" }));
  await act(async () => {
    return hold.letGo();
  });
  await waitForWritesToSettle(client);
  await screen.findByText("Couldn't save your changes.");
  expect(field).toHaveValue("Hi @Jorge ");
  expect(
    screen.queryByRole("button", { name: "Keep as plain text" }),
  ).not.toBeInTheDocument();
});
