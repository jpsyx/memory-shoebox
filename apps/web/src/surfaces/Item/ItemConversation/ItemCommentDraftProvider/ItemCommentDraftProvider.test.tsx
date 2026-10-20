import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ItemCommentDraftProvider,
  useItemCommentDraftMemory,
} from "./ItemCommentDraftProvider";

describe("item draft memory", () => {
  it("keeps immutable per-item values and starts missing items empty", () => {
    const { result } = renderHook(useItemCommentDraftMemory, {
      wrapper: ItemCommentDraftProvider,
    });
    const empty = result.current.read("photo");
    expect(empty).toMatchObject({
      body: "",
      atSeconds: undefined,
      hasStarted: false,
    });
    act(() => {
      return result.current.update("photo", { body: "Photo words" });
    });
    const photo = result.current.read("photo");
    act(() => {
      return result.current.update("video", {
        body: "Video words",
        atSeconds: 6.25,
        hasStarted: true,
      });
    });
    act(() => {
      return result.current.update("photo", { body: "Later words" });
    });
    expect(photo.body).toBe("Photo words");
    expect(empty.body).toBe("");
    expect(result.current.read("video")).toMatchObject({
      body: "Video words",
      atSeconds: 6.25,
      hasStarted: true,
    });
    expect(result.current.read("photo").revision).toBeGreaterThan(
      photo.revision,
    );
    act(() => {
      return result.current.remove("photo");
    });
    expect(result.current.read("photo").body).toBe("");
    expect(result.current.read("video").body).toBe("Video words");
  });

  it("discards every item when the provider lifetime ends", () => {
    const previous = renderHook(useItemCommentDraftMemory, {
      wrapper: ItemCommentDraftProvider,
    });
    act(() => {
      return previous.result.current.update("photo", { body: "Private words" });
    });
    previous.unmount();
    const fresh = renderHook(useItemCommentDraftMemory, {
      wrapper: ItemCommentDraftProvider,
    });
    expect(fresh.result.current.read("photo").body).toBe("");
  });
});
