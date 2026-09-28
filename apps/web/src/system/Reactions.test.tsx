import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactionSummary } from "@memory-shoebox/shared";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Reactions } from "@/system/Reactions";
import { cssVariablesResolver, theme } from "@/theme/theme";

/*
 * jsdom performs no real layout: every element's bounding rect, and the
 * document's own client size, come back as 0x0. Floating UI (Mantine's
 * Popover) reads both to ask whether its target is clipped out of view, and
 * a 0x0 target inside a 0x0 viewport reads as "fully clipped", so it renders
 * the dropdown as `display: none` forever, not just for one frame. These two
 * stand-ins give it a plausible, non-zero box on both sides of that check,
 * scoped to this file rather than every test in the suite.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = (): DOMRect => {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      top: 0,
      left: 0,
      right: 100,
      bottom: 40,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
  for (const element of [document.documentElement, document.body]) {
    Object.defineProperty(element, "clientWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(element, "clientHeight", {
      configurable: true,
      value: 768,
    });
  }
});

const SUMMARY: ReactionSummary = {
  kinds: [
    {
      kind: "love",
      count: 2,
      members: [
        { memberId: "a", displayName: "Abuela Rosa" },
        { memberId: "b", displayName: "Mamá" },
      ],
    },
    {
      kind: "like",
      count: 1,
      members: [{ memberId: "c", displayName: "Tía" }],
    },
  ],
  myKind: null,
};

function _render(summary: ReactionSummary, onReact?: () => void) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <Reactions reactions={summary} onReact={onReact} />
    </MantineProvider>,
  );
}

describe("Reactions", () => {
  it("offers six choices, each carrying its word", async () => {
    _render(SUMMARY);
    await userEvent.click(screen.getByRole("button", { name: /React/ }));

    for (const word of ["Like", "Love", "Care", "Haha", "Wow", "Sad"]) {
      /*
       * The picker mounts synchronously on open but Mantine's Popover fades
       * it in over a real transition, so the button exists before it is
       * `toBeVisible`. `waitFor` rides out that transition instead of
       * asserting mid-fade.
       */
      await waitFor(() => {
        expect(screen.getByRole("button", { name: word })).toBeVisible();
      });
    }
  });

  it("totals the server's counts", () => {
    _render(SUMMARY);
    expect(screen.getByText("3")).toBeVisible();
  });

  it("names your own choice on the action once you have left one", () => {
    _render({ ...SUMMARY, myKind: "love" });
    expect(screen.getByRole("button", { name: /Love/ })).toBeVisible();
  });

  it("reports the kind chosen, and null when it is pressed again", async () => {
    const onReact = vi.fn();
    _render({ ...SUMMARY, myKind: "love" }, onReact);

    await userEvent.click(screen.getByRole("button", { name: /Love/ }));

    /*
     * The action button's own accessible name also contains "Love", so an
     * unscoped `getByRole` here would match both it and the picker's choice.
     * The picker is the popover with role "dialog": scoping the query to it
     * picks the one button this test means to press.
     */
    const pickerLove = await waitFor(() => {
      const picker = screen.getByRole("dialog");
      const button = within(picker).getByRole("button", { name: "Love" });
      expect(button).toBeVisible();
      return button;
    });

    await userEvent.click(pickerLove);
    expect(onReact).toHaveBeenCalledWith(null);
  });
});
