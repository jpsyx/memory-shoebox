import { itemQueryOptions } from "@/api/items/items";
import { getRecordedLines, stubFetch } from "@/testing/fetchStubHelpers";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { waitForWritesToSettle } from "@/testing/itemWriteTestHelpers";
import { act } from "@testing-library/react";
import { expect, it } from "vitest";
import {
  DELETE,
  REQUEST,
  VIEWER,
  renderRemovalActionController,
} from "./renderRemovalActionController";
it("marks item details stale without reading them and invalidates both queue tabs", async () => {
  stubFetch({ [DELETE]: { body: undefined, status: 204 } });
  const { result, queryClient } = renderRemovalActionController();
  const openKey = ["removal-requests", "queue", VIEWER.memberId, "state=open"];
  const settledKey = [
    "removal-requests",
    "queue",
    VIEWER.memberId,
    "state=settled",
  ];
  queryClient.setQueryData(openKey, {});
  queryClient.setQueryData(settledKey, {});
  const itemKey = itemQueryOptions(REQUEST.itemId!).queryKey;
  queryClient.setQueryData(itemKey, makeItemDetail());
  act(() => {
    return result.current.openDelete(REQUEST);
  });
  act(() => {
    return result.current.confirmDelete();
  });
  await waitForWritesToSettle(queryClient);
  expect(queryClient.getQueryState(openKey)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(settledKey)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(itemKey)?.isInvalidated).toBe(true);
  expect(getRecordedLines()).toEqual([DELETE]);
});
