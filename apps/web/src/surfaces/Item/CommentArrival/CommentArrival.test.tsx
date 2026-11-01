import {
  ITEM_ID,
  makeItemDetail,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import { respondWithItem } from "@/testing/itemHarnessHelpers";
import { renderAt } from "@/testing/surfaceHarnessHelpers";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { collectionRoutes, comment } from "./commentArrivalTestHelpers";

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
