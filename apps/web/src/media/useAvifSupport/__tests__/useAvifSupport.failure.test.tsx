import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAvifSupport } from "../useAvifSupport";

it("settles a failed local probe as unsupported and ignores late load events", async () => {
  const created = document.createElement.bind(document);
  let probe: HTMLImageElement | undefined;
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const element = created(tag, options);
    if (element instanceof HTMLImageElement) {
      probe = element;
    }
    return element;
  });
  const first = renderHook(useAvifSupport);
  await act(async () => {
    probe!.dispatchEvent(new Event("error"));
  });
  await act(async () => {
    probe!.dispatchEvent(new Event("load"));
  });
  expect(first.result.current).toBe(false);
  const later = renderHook(useAvifSupport);
  expect(later.result.current).toBe(false);
  first.unmount();
  later.unmount();
  vi.restoreAllMocks();
});
