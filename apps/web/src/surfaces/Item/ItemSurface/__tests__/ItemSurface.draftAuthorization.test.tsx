import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderItem, respondWithItem } from "@/testing/itemHarnessHelpers";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtureHelpers";
import type { Answer } from "@/testing/fetchStubHelpers";

const OTHER_ITEM_ID = "00000000-0000-4000-8000-000000000002";

afterEach(() => {
  return vi.unstubAllGlobals();
});

describe("item surface draft authorization", () => {
  it("clears only the refused item and retains another item through denial and recovery", async () => {
    const firstDetail = makeItemDetail();
    const firstAnswer: Answer = { status: 200, body: firstDetail };
    respondWithItem({
      detail: firstDetail,
      routes: {
        [`GET /api/items/${ITEM_ID}`]: firstAnswer,
        [`GET /api/items/${OTHER_ITEM_ID}`]: {
          status: 200,
          body: { ...makeItemDetail(), itemId: OTHER_ITEM_ID },
        },
      },
    });
    const { router } = renderItem(ITEM_ID);
    const firstField = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    fireEvent.change(firstField, { target: { value: "First private memory" } });
    await act(async () => {
      await router.navigate({
        to: "/items/$itemId",
        params: { itemId: OTHER_ITEM_ID },
      });
    });
    await waitFor(() => {
      return expect(
        screen.getByRole("textbox", { name: "Write a comment" }),
      ).toHaveValue("");
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Write a comment" }), {
      target: { value: "Other authorized memory" },
    });
    firstAnswer.status = 404;
    firstAnswer.body = { error: "not_found", message: "Not here." };
    await act(async () => {
      await router.navigate({
        to: "/items/$itemId",
        params: { itemId: ITEM_ID },
      });
    });
    await waitFor(() => {
      return expect(
        screen.queryByRole("textbox", { name: "Write a comment" }),
      ).not.toBeInTheDocument();
    });
    await act(async () => {
      await router.navigate({
        to: "/items/$itemId",
        params: { itemId: OTHER_ITEM_ID },
      });
    });
    await waitFor(() => {
      return expect(
        screen.getByRole("textbox", { name: "Write a comment" }),
      ).toHaveValue("Other authorized memory");
    });
    firstAnswer.status = 200;
    firstAnswer.body = firstDetail;
    await act(async () => {
      await router.navigate({
        to: "/items/$itemId",
        params: { itemId: ITEM_ID },
      });
    });
    await waitFor(() => {
      return expect(
        screen.getByRole("textbox", { name: "Write a comment" }),
      ).toHaveValue("");
    });
  });
});
