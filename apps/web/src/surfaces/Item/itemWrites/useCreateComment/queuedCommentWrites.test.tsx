import { removePrivateQueries } from "@/api/me/privateQueryHelpers";
import { createMeResponse } from "@/testing/createMeResponse";
import { getRecordedLines, stubFetch } from "@/testing/fetchStubHelpers";
import { ITEM_ID, makeComment } from "@/testing/itemFixtureHelpers";
import {
  makeHold,
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
import { act, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { makeWriteScopeFromItemId } from "../itemWriteHelpers/itemWriteHelpers";
import { useEditComment } from "../useEditComment";
import { useCreateComment } from "./useCreateComment";

afterEach(() => {
  vi.unstubAllGlobals();
});
it.each([
  ["create", true],
  ["create", false],
  ["edit", true],
  ["edit", false],
] as const)(
  "fences queued %s dispatch only when retired (%s)",
  async (kind, retire) => {
    const client = makeQueryClientFromItemDetail();
    const held = makeHold();
    const blocker = client.getMutationCache().build(client, {
      scope: makeWriteScopeFromItemId(ITEM_ID),
      mutationFn: () => {
        return held.hold;
      },
    });
    const blocked = blocker.execute(undefined);
    const comment = makeComment();
    const endpoint =
      kind === "create"
        ? `POST /api/items/${ITEM_ID}/comments`
        : `PATCH /api/comments/${comment.commentId}`;
    stubFetch({ [endpoint]: { status: 200, body: comment } });
    const onSaved = vi.fn();
    const hook = renderHookWithQueryClient({
      queryClient: client,
      useHook: () => {
        return {
          create: useCreateComment(ITEM_ID),
          edit: useEditComment({
            itemId: ITEM_ID,
            commentId: comment.commentId,
          }),
        };
      },
    });
    act(() => {
      if (kind === "create") {
        hook.result.current.create.send({
          draft: { body: "Private draft", commentTags: [] },
          onSent: onSaved,
        });
      } else {
        hook.result.current.edit.save({
          body: "Private draft",
          commentTags: [],
          onSaved,
        });
      }
    });
    await waitFor(() => {
      expect(
        client
          .getMutationCache()
          .getAll()
          .filter((entry) => {
            return entry.state.isPaused;
          }),
      ).toHaveLength(1);
    });
    expect(getRecordedLines()).toEqual([]);
    if (retire) {
      act(() => {
        removePrivateQueries(client);
        client.setQueryData(
          ["me"],
          createMeResponse({
            sessionId: "019f0000-0000-7000-8000-000000000998",
            ...(kind === "create"
              ? { memberId: "019f0000-0000-7000-8000-000000000999" }
              : {}),
          }),
        );
      });
    }
    await act(async () => {
      held.letGo();
      await blocked;
    });
    await waitForWritesToSettle(client);
    expect(getRecordedLines()).toEqual(retire ? [] : [endpoint]);
    expect(onSaved).toHaveBeenCalledTimes(retire ? 0 : 1);
    hook.unmount();
    client.clear();
  },
);
