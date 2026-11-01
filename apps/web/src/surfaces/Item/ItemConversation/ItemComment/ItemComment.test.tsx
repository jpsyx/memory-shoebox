import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  makeHold,
  makeQueryClientFromItemDetail,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
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

it.each(["append", "shift", "replace"])(
  "reconciles a fresh saved occurrence after %s while retaining newer edits",
  async (change) => {
    const hold = makeHold();
    const saved = makeComment({
      ...comment,
      body: "@Jorge",
      commentTags: [
        {
          memberId: SIGNED_IN.memberId,
          tagId: "00000000-0000-4000-8000-000000000099",
          start: 0,
          end: 6,
          label: "Jorge",
        },
      ],
    });
    stubFetch({
      [`PATCH /api/comments/${comment.commentId}`]: {
        status: 200,
        body: saved,
        waitFor: hold.hold,
      },
      [`GET /api/items/${ITEM_ID}/comment-tag-candidates`]: {
        status: 200,
        body: { members: [{ ...SIGNED_IN, displayName: "Jorge" }] },
      },
    });
    const client = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", {
      name: "What you wrote",
    }) as HTMLTextAreaElement;
    await user.clear(field);
    await user.type(field, "  @");
    await user.click(await screen.findByRole("option", { name: "Jorge" }));
    await user.click(screen.getByRole("button", { name: "Save the change" }));
    await waitFor(() => {
      expect(
        getRecordedRequests().some((request) => {
          return request.method === "PATCH";
        }),
      ).toBe(true);
    });
    if (change === "append") {
      await user.type(field, "more");
    }
    if (change === "shift") {
      await user.click(field);
      field.setSelectionRange(0, 0);
      await user.keyboard("Wow ");
    }
    if (change === "replace") {
      await user.clear(field);
      await user.type(field, "  @");
      await user.click(await screen.findByRole("option", { name: "Jorge" }));
    }
    const newer = field.value;
    await act(async () => {
      hold.letGo();
    });
    await waitForWritesToSettle(client);
    expect(field).toHaveValue(newer);
    if (change === "shift") {
      await user.keyboard("{Control>}z{/Control}");
      expect(field.value).not.toBe(newer);
      await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
      expect(field).toHaveValue(newer);
    }
    // The member's current eligible directory no longer contains the saved
    // name.
    stubFetch({
      [`PATCH /api/comments/${comment.commentId}`]: {
        status: 200,
        body: saved,
      },
      [`GET /api/items/${ITEM_ID}/comment-tag-candidates`]: {
        status: 200,
        body: { members: [] },
      },
    });
    await user.click(screen.getByRole("button", { name: "Save the change" }));
    await waitFor(() => {
      expect(
        getRecordedRequests().filter((request) => {
          return request.method === "PATCH";
        }),
      ).toHaveLength(1);
    });
    const submittedRequest = getRecordedRequests().find((request) => {
      return request.method === "PATCH";
    })?.body;
    expect(submittedRequest).toMatchObject({
      body: newer,
      commentTags: [
        {
          memberId: SIGNED_IN.memberId,
          start: change === "shift" ? 6 : 2,
          end: change === "shift" ? 12 : 8,
        },
      ],
    });
    const tag = (submittedRequest as { commentTags: Array<{ tagId?: string }> })
      .commentTags[0];
    if (change === "replace") {
      expect(tag?.tagId).toBeUndefined();
    } else {
      expect(tag?.tagId).toBe(saved.commentTags[0]?.tagId);
    }
  },
);
