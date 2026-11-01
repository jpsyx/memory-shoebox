import { createMeResponse } from "@/testing/createMeResponse";
import { getRecordedRequests, type Answer } from "@/testing/fetchStubHelpers";
import {
  ITEM_ID,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import { respondWithItem } from "@/testing/itemHarnessHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { renderAt } from "@/testing/surfaceHarnessHelpers";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { collectionRoutes, comment } from "./commentArrivalTestHelpers";

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
