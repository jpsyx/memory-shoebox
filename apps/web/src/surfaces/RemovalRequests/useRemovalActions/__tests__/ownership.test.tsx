import { stubFetch } from "@/testing/fetchStubHelpers";
import {
  makeHold,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useRemovalActions } from ".././useRemovalActions";
import { DELETE, REQUEST, VIEWER } from "./renderRemovalActionController";
it("keeps an old viewer result out of a newer viewer's target and queue", async () => {
  const { hold, letGo } = makeHold();
  stubFetch({ [DELETE]: { body: undefined, status: 204, waitFor: hold } });
  let viewer: import("@/session/requireSignedIn/requireSignedIn").Viewer = {
    ...VIEWER,
  };
  const queryClient = new QueryClient();
  const onDeleted = vi.fn();
  const { result, rerender } = renderHookWithQueryClient({
    queryClient,
    useHook: () => {
      return useRemovalActions({ viewer, onItemDeleted: onDeleted });
    },
  });
  act(() => {
    return result.current.openDelete(REQUEST);
  });
  act(() => {
    return result.current.confirmDelete();
  });
  viewer = { ...VIEWER, memberId: "another-viewer" };
  rerender();
  const anotherRequest = { ...REQUEST, requestId: "another-request" };
  act(() => {
    return result.current.openDecline(anotherRequest);
  });
  expect(result.current.target?.requestId).toBe(anotherRequest.requestId);
  await act(async () => {
    return letGo();
  });
  await waitForWritesToSettle(queryClient);
  expect(result.current.dialog).toBe("decline");
  expect(result.current.target?.requestId).toBe(anotherRequest.requestId);
  expect(onDeleted).not.toHaveBeenCalled();
  expect(
    queryClient.getQueriesData({
      queryKey: ["removal-requests", "queue", viewer.memberId],
    }),
  ).toEqual([]);
});
