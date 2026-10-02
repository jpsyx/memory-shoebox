import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactionSummary } from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";
import { Reactions } from "@/system/Reactions/Reactions";
import { makeSummaryFromChoice } from "@/system/Reactions/presentReactions";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

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

const VIEWER = { memberId: "me", displayName: "Papá" };

function _render(summary: ReactionSummary, onReact?: () => void) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <Reactions reactions={summary} viewer={VIEWER} onReact={onReact} />
    </MantineProvider>,
  );
}

describe("Reactions", () => {
  it("offers six choices, each carrying its word", async () => {
    _render(SUMMARY);
    await userEvent.click(screen.getByRole("button", { name: /React/ }));

    for (const word of ["Like", "Love", "Care", "Haha", "Wow", "Sad"]) {
      // The picker mounts synchronously on open but Mantine's Popover fades
      // it in over a real transition, so the button exists before it is
      // `toBeVisible`. `waitFor` rides out that transition instead of
      // asserting mid-fade.
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

  it("moves your name with your count when you change your mind", async () => {
    _render({
      ...SUMMARY,
      kinds: [
        {
          kind: "love",
          count: 2,
          members: [{ memberId: "a", displayName: "Abuela Rosa" }, VIEWER],
        },
        {
          kind: "like",
          count: 1,
          members: [{ memberId: "c", displayName: "Tía" }],
        },
      ],
      myKind: "love",
    });

    await userEvent.click(screen.getByRole("button", { name: /Love/ }));
    const picker = await screen.findByRole("dialog");
    await userEvent.click(within(picker).getByRole("button", { name: "Like" }));

    await userEvent.click(screen.getByRole("button", { name: /^3$/ }));
    const who = await screen.findByText("Abuela Rosa");

    // Moved to Like, so Love must no longer name you.
    expect(who.textContent).not.toContain("Papá");
    expect(screen.getByText(/Tía/)).toHaveTextContent("Papá");
  });

  it("reports the kind chosen, and null when it is pressed again", async () => {
    const onReact = vi.fn();
    _render({ ...SUMMARY, myKind: "love" }, onReact);

    await userEvent.click(screen.getByRole("button", { name: /Love/ }));

    // The action button's own accessible name also contains "Love", so an
    // unscoped `getByRole` here would match both it and the picker's choice.
    // The picker is the popover with role "dialog": scoping the query to it
    // picks the one button this test means to press.
    const pickerLove = await waitFor(() => {
      const picker = screen.getByRole("dialog");
      const button = within(picker).getByRole("button", { name: "Love" });
      expect(button).toBeVisible();
      return button;
    });

    await userEvent.click(pickerLove);
    expect(onReact).toHaveBeenCalledWith(null);
  });

  it("takes the server's answer when it arrives", () => {
    const { rerender } = _render(SUMMARY);

    rerender(
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
      >
        <Reactions
          reactions={{
            kinds: [
              ...SUMMARY.kinds,
              { kind: "care", count: 1, members: [VIEWER] },
            ],
            myKind: "care",
          }}
          viewer={VIEWER}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("button", { name: /Care/ })).toBeVisible();
  });
});

describe("makeSummaryFromChoice", () => {
  it("adds my reaction as a kind of its own when nobody had left it", () => {
    expect(
      makeSummaryFromChoice({
        reactions: SUMMARY,
        chosen: "wow",
        viewer: VIEWER,
      }),
    ).toEqual({
      kinds: [...SUMMARY.kinds, { kind: "wow", count: 1, members: [VIEWER] }],
      myKind: "wow",
    });
  });

  it("drops a kind that taking mine off leaves at nought", () => {
    const mine: ReactionSummary = {
      kinds: [{ kind: "sad", count: 1, members: [VIEWER] }],
      myKind: "sad",
    };
    expect(
      makeSummaryFromChoice({ reactions: mine, chosen: null, viewer: VIEWER }),
    ).toEqual({ kinds: [], myKind: null });
  });
});
