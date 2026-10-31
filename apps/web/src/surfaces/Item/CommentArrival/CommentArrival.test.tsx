import { createMeResponse } from "@/testing/createMeResponse";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { getRecordedRequests, type Answer } from "@/testing/fetchStubHelpers";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderAt } from "@/testing/surfaceHarnessHelpers";
import { respondWithItem } from "@/testing/itemHarnessHelpers";
import {
  makeComment,
  makeItemDetail,
  makeVideoDetail,
  ITEM_ID,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
const comment = makeComment({
  body: "Hi @Jorge",
  commentTags: [
    {
      tagId: "00000000-0000-4000-8000-000000000009",
      memberId: SIGNED_IN.memberId,
      label: "Jorge",
      start: 3,
      end: 9,
    },
  ],
});
const collectionRoutes = {
  [`GET /api/member-collections/${SIGNED_IN.memberId}`]: {
    status: 200,
    body: { member: SIGNED_IN },
  },
};
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "audioTracks", "get").mockReturnValue(
    undefined as never,
  );
  vi.spyOn(HTMLMediaElement.prototype, "videoTracks", "get").mockReturnValue(
    undefined as never,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("focuses a readable comment on a real deep-link arrival", async () => {
  respondWithItem({ detail: makeItemDetail({ comments: [comment] }) });
  renderAt(`/items/${ITEM_ID}?comment=${comment.commentId}`);
  const link = await screen.findByRole("link", {
    name: "Jorge, view photos and videos",
  });
  await waitFor(() => {
    return expect(link.closest("article")).toHaveFocus();
  });
});
it("announces a deleted or unknown comment on a visible item", async () => {
  respondWithItem({ detail: makeItemDetail({ comments: [] }) });
  renderAt(`/items/${ITEM_ID}?comment=${comment.commentId}`);
  expect(
    await screen.findByText("That comment is no longer available."),
  ).toBeVisible();
});
it.each(["link", "history"])(
  "keeps a main draft and selection through collection return via %s",
  async (returnMode) => {
    respondWithItem({
      detail: makeItemDetail({ comments: [comment] }),
      routes: {
        [`GET /api/member-collections/${SIGNED_IN.memberId}`]: {
          status: 200,
          body: { member: SIGNED_IN },
        },
      },
    });
    const { router } = renderAt(`/items/${ITEM_ID}`);
    const field = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    fireEvent.change(field, { target: { value: "Unfinished words" } });
    (field as HTMLTextAreaElement).setSelectionRange(2, 8);
    fireEvent.select(field);
    fireEvent.click(
      screen.getByRole("link", { name: "Jorge, view photos and videos" }),
    );
    const back = await screen.findByRole("link", { name: "Back to comment" });
    expect(router.state.location.href).toBe(`/?member=${SIGNED_IN.memberId}`);
    await act(async () => {
      if (returnMode === "history") {
        router.history.back();
      } else {
        fireEvent.click(back);
      }
    });
    expect(
      await screen.findByRole("textbox", { name: "Write a comment" }),
    ).toHaveValue("Unfinished words");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Write a comment",
        }) as HTMLTextAreaElement
      ).selectionEnd,
    ).toBe(8);
  },
);

it.each(["reply", "edit"] as const)(
  "restores an actual %s form and both selection endpoints",
  async (mode) => {
    const own = { ...comment, author: SIGNED_IN, canEdit: true };
    const detail = makeVideoDetail({
      comments: [
        own,
        { ...comment, commentId: "00000000-0000-4000-8000-000000000008" },
      ],
    });
    respondWithItem({ detail, routes: collectionRoutes });
    renderAt(`/items/${ITEM_ID}`);
    await screen.findByRole("textbox", { name: "Write a comment" });
    fireEvent.click(
      screen.getAllByRole("button", {
        name: mode === "reply" ? `Reply to ${SIGNED_IN.displayName}` : "Edit",
      })[0]!,
    );
    const label =
      mode === "reply" ? `Reply to ${SIGNED_IN.displayName}` : "What you wrote";
    const field = screen.getByRole("textbox", {
      name: label,
    }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Unfinished words" } });
    field.setSelectionRange(2, 8);
    fireEvent.select(field);
    fireEvent.click(
      screen
        .getAllByRole("link", { name: "Jorge, view photos and videos" })
        .at(-1)!,
    );
    fireEvent.click(
      await screen.findByRole("link", { name: "Back to comment" }),
    );
    const restored = (await screen.findByRole("textbox", {
      name: label,
    })) as HTMLTextAreaElement;
    expect(restored).toHaveValue("Unfinished words");
    expect([restored.selectionStart, restored.selectionEnd]).toEqual([2, 8]);
    expect(restored).toHaveFocus();
  },
);

it("does not reveal cached drafts while current-entry access is pending or denied", async () => {
  const detail = makeItemDetail({ comments: [comment] });
  const answer: Answer = { status: 200, body: detail };
  respondWithItem({
    detail,
    routes: { ...collectionRoutes, [`GET /api/items/${ITEM_ID}`]: answer },
  });
  const { router } = renderAt(`/items/${ITEM_ID}`);
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Write a comment" }),
    { target: { value: "Sensitive words" } },
  );
  fireEvent.click(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  );
  const back = await screen.findByRole("link", { name: "Back to comment" });
  const hold = makeHold();
  answer.waitFor = hold.hold;
  fireEvent.click(back);
  await waitFor(() => {
    return expect(router.state.location.pathname).toBe(`/items/${ITEM_ID}`);
  });
  expect(screen.queryByDisplayValue("Sensitive words")).not.toBeInTheDocument();
  answer.status = 404;
  answer.body = { error: "not_found", message: "Not here." };
  await act(async () => {
    return hold.letGo();
  });
  expect(screen.queryByDisplayValue("Sensitive words")).not.toBeInTheDocument();
  await act(async () => {
    await router.navigate({ to: "/", search: { member: SIGNED_IN.memberId } });
  });
  expect(
    screen.queryByRole("link", { name: "Back to comment" }),
  ).not.toBeInTheDocument();
  answer.status = 200;
  answer.body = detail;
  answer.waitFor = undefined;
  await act(async () => {
    await router.navigate({
      to: "/items/$itemId",
      params: { itemId: ITEM_ID },
    });
  });
  expect(
    await screen.findByRole("textbox", { name: "Write a comment" }),
  ).toHaveValue("");
});

it("ignores a previous entry's delayed authorization after navigating away and back", async () => {
  const detail = makeItemDetail({ comments: [comment] });
  const answer: Answer = { status: 200, body: detail };
  respondWithItem({
    detail,
    routes: { ...collectionRoutes, [`GET /api/items/${ITEM_ID}`]: answer },
  });
  const { router } = renderAt(`/items/${ITEM_ID}`);
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Write a comment" }),
    { target: { value: "Private draft" } },
  );
  fireEvent.click(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  );
  const first = makeHold();
  answer.waitFor = first.hold;
  fireEvent.click(await screen.findByRole("link", { name: "Back to comment" }));
  await waitFor(() => {
    return expect(
      getRecordedRequests().filter((request) => {
        return request.url === `/api/items/${ITEM_ID}`;
      }),
    ).toHaveLength(2);
  });
  await act(async () => {
    await router.navigate({ to: "/", search: { member: SIGNED_IN.memberId } });
  });
  const second = makeHold();
  answer.waitFor = second.hold;
  fireEvent.click(await screen.findByRole("link", { name: "Back to comment" }));
  await waitFor(() => {
    return expect(
      getRecordedRequests().filter((request) => {
        return request.url === `/api/items/${ITEM_ID}`;
      }),
    ).toHaveLength(3);
  });
  await act(async () => {
    return first.letGo();
  });
  expect(screen.queryByDisplayValue("Private draft")).not.toBeInTheDocument();
  await act(async () => {
    return second.letGo();
  });
  expect(
    await screen.findByRole("textbox", { name: "Write a comment" }),
  ).toHaveValue("Private draft");
});

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

it("restores window theater and scroll without autoplay or seeking on return", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const detail = makeVideoDetail({ comments: [{ ...comment, atSeconds: 6 }] });
  respondWithItem({ detail, routes: collectionRoutes });
  const { container } = renderAt(
    `/items/${ITEM_ID}?comment=${comment.commentId}`,
  );
  await screen.findByRole("textbox", { name: "Write a comment" });
  expect(play).not.toHaveBeenCalled();
  expect(container.querySelector("video")?.currentTime).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Enter full screen" }));
  fireEvent.click(screen.getByRole("button", { name: /Open comments/ }));
  const threads = container.querySelector("[data-conversation-scroll]")!;
  threads.scrollTop = 123;
  fireEvent.click(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  );
  await screen.findByRole("link", { name: "Back to comment" });
  play.mockClear();
  fireEvent.click(screen.getByRole("link", { name: "Back to comment" }));
  expect(
    await screen.findByRole("dialog", { name: "Full screen" }),
  ).toBeVisible();
  await waitFor(() => {
    return expect(
      container.querySelector("[data-conversation-scroll]")?.scrollTop,
    ).toBe(123);
  });
  expect(play).not.toHaveBeenCalled();
  expect(container.querySelector("video")?.currentTime).toBe(0);
});

it("modified activation keeps the native href and creates no return journey", async () => {
  respondWithItem({
    detail: makeItemDetail({ comments: [comment] }),
    routes: collectionRoutes,
  });
  const { router } = renderAt(`/items/${ITEM_ID}`);
  const link = await screen.findByRole("link", {
    name: "Jorge, view photos and videos",
  });
  let wasPrevented = true;
  document.addEventListener(
    "click",
    (event) => {
      wasPrevented = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  fireEvent.click(link, { metaKey: true });
  expect(wasPrevented).toBe(false);
  expect(router.state.location.pathname).toBe(`/items/${ITEM_ID}`);
  await act(async () => {
    await router.navigate({ to: "/", search: { member: SIGNED_IN.memberId } });
  });
  expect(
    screen.queryByRole("link", { name: "Back to comment" }),
  ).not.toBeInTheDocument();
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
it("does not apply an old edit response to a replacement item query", async () => {
  const hold = makeHold();
  const own = { ...comment, author: SIGNED_IN, canEdit: true };
  const detail = makeItemDetail({ comments: [own] });
  respondWithItem({
    detail,
    routes: {
      [`PATCH /api/comments/${own.commentId}`]: {
        status: 200,
        body: { ...own, body: "Old session saved text", commentTags: [] },
        waitFor: hold.hold,
      },
    },
  });
  const { router } = renderAt(`/items/${ITEM_ID}`);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByRole("textbox", { name: "What you wrote" }), {
    target: { value: "Old session saved text" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save the change" }));
  await waitFor(() => {
    expect(
      getRecordedRequests().some((request) => {
        return request.method === "PATCH";
      }),
    ).toBe(true);
  });
  const client = router.options.context!.queryClient;
  await act(async () => {
    client.removeQueries({ queryKey: ["items", ITEM_ID], exact: true });
    client.setQueryData(["items", ITEM_ID], {
      ...detail,
      comments: [{ ...own, body: "Replacement session text", commentTags: [] }],
    });
    hold.letGo();
  });
  await waitFor(() => {
    expect(client.isMutating()).toBe(0);
  });
  expect(
    client.getQueryData<{ comments: Array<{ body: string }> }>([
      "items",
      ITEM_ID,
    ])?.comments[0]?.body,
  ).toBe("Replacement session text");
});
it("retires the journey before returning after a same-account cookie replacement is observed", async () => {
  const account = createMeResponse();
  respondWithItem({
    detail: makeItemDetail({ comments: [comment] }),
    routes: {
      ...collectionRoutes,
      "GET /api/me": { status: 200, body: account },
    },
  });
  const { router } = renderAt(`/items/${ITEM_ID}`);
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Write a comment" }),
    { target: { value: "Previous session words" } },
  );
  fireEvent.click(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  );
  await screen.findByRole("link", { name: "Back to comment" });
  account.sessionId = "00000000-0000-4000-8000-000000000099";
  await act(async () => {
    router.history.back();
  });
  expect(
    await screen.findByRole("textbox", { name: "Write a comment" }),
  ).toHaveValue("");
  expect(
    screen.queryByDisplayValue("Previous session words"),
  ).not.toBeInTheDocument();
});
it("reveals the reply's parent thread and focuses the reply without seeking", async () => {
  const reply = {
    ...comment,
    commentId: "00000000-0000-4000-8000-000000000088",
    parentCommentId: comment.commentId,
    atSeconds: 6,
  };
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  respondWithItem({
    detail: makeVideoDetail({
      comments: [{ ...comment, atSeconds: 6 }, reply],
    }),
  });
  const { container } = renderAt(
    `/items/${ITEM_ID}?comment=${reply.commentId}`,
  );
  await screen.findByRole("textbox", { name: "Write a comment" });
  expect(
    container.querySelector(`[data-comment-id="${comment.commentId}"]`),
  ).toBeVisible();
  await waitFor(() => {
    expect(
      container.querySelector(`[data-comment-id="${reply.commentId}"]`),
    ).toHaveFocus();
  });
  expect(play).not.toHaveBeenCalled();
  expect(container.querySelector("video")?.currentTime).toBe(0);
});
