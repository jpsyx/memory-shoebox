import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAvifSupport } from "../useAvifSupport";

it("publishes a successful local probe to existing and later consumers", async () => {
  const created = document.createElement.bind(document);
  let probe: HTMLImageElement | undefined;
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const element = created(tag, options);
    if (element instanceof HTMLImageElement) {
      probe = element;
      Object.defineProperties(element, {
        naturalWidth: { value: 1 },
        naturalHeight: { value: 1 },
        decode: {
          value: () => {
            return Promise.resolve();
          },
        },
      });
    }
    return element;
  });
  const first = renderHook(useAvifSupport);
  const second = renderHook(useAvifSupport);
  expect(first.result.current).toBe(false);
  expect(second.result.current).toBe(false);
  expect(probe?.src).toMatch(/^data:image\/avif;base64,/);
  await act(async () => {
    probe!.dispatchEvent(new Event("load"));
  });
  await waitFor(() => {
    expect(first.result.current).toBe(true);
  });
  expect(second.result.current).toBe(true);
  const later = renderHook(useAvifSupport);
  expect(later.result.current).toBe(true);
  first.unmount();
  second.unmount();
  later.unmount();
  vi.restoreAllMocks();
});
