import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  detail,
  firstId,
  secondId,
  renderReconcileController,
  waitForReconcileRows,
  getReconcileWritesFromRequests,
} from "./reconcileTestHelpers";
describe("changed one-day server errors", () => {
  it("rebases a rejected date when authoritative recovery supplies a new sole day", async () => {
    const { result, answer, detailAnswer, page } = renderReconcileController();
    await waitForReconcileRows(result);
    answer.status = 400;
    answer.body = {
      error: "validation_error",
      message: "Outside span",
      details: {
        fieldErrors: { "moves.0.targetOn": ["Choose an occasion day"] },
      },
    };
    act(() => {
      result.current.changeTarget({ itemId: firstId, targetOn: "2026-09-18" });
      result.current.changeTarget({ itemId: secondId, targetOn: "2026-09-20" });
    });
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          detailAnswer.body = {
            ...detail,
            milestone: {
              ...detail.milestone,
              startsOn: "2026-09-20",
              endsOn: "2026-09-20",
            },
          };
          page.body.milestone = detailAnswer.body.milestone;
        }
        return original(url, init);
      }),
    );
    act(() => {
      return result.current.move();
    });
    await waitFor(() => {
      return expect(result.current.targets[firstId]).toBe("2026-09-20");
    });
    expect(result.current.fieldErrors[firstId]).toBeUndefined();
    expect(getReconcileWritesFromRequests()).toHaveLength(1);
  });
});
