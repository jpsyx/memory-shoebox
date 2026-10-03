import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactionSummary } from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Reactions } from "@/system/Reactions/Reactions";
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

/** The theme, around whatever is rendered or rerendered. */
function _Providers({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  );
}

function _render(summary: ReactionSummary, onReact?: () => void) {
  return render(
    <Reactions reactions={summary} viewer={VIEWER} onReact={onReact} />,
    { wrapper: _Providers },
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
    const summary = screen.getByRole("button", {
      name: "3 reactions. See who left them",
    });
    expect(within(summary).getByText("3")).toBeVisible();
  });

  it("says one reaction, not one reactions", () => {
    _render({ ...SUMMARY, kinds: [SUMMARY.kinds[1]!] });
    expect(
      screen.getByRole("button", { name: "1 reaction. See who left it" }),
    ).toBeVisible();
  });

  it("keeps the summary's marks out of what a screen reader hears", () => {
    _render(SUMMARY);
    const summary = screen.getByRole("button", {
      name: "3 reactions. See who left them",
    });
    const marks = Array.from(summary.querySelectorAll("svg"));
    expect(marks).toHaveLength(2);
    marks.forEach((mark) => {
      expect(mark.closest("[aria-hidden='true']")).not.toBeNull();
    });
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

    await userEvent.click(
      screen.getByRole("button", { name: "3 reactions. See who left them" }),
    );
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

  it("names the server's choice on the action once a new summary arrives", () => {
    const { rerender } = _render(SUMMARY);

    rerender(
      <Reactions
        reactions={{
          kinds: [
            ...SUMMARY.kinds,
            { kind: "care", count: 1, members: [VIEWER] },
          ],
          myKind: "care",
        }}
        viewer={VIEWER}
      />,
    );

    expect(screen.getByRole("button", { name: /Care/ })).toBeVisible();
  });

  it("puts a tap back when the summary it was given is a new one", async () => {
    const { rerender } = _render(SUMMARY);

    await userEvent.click(screen.getByRole("button", { name: /React/ }));
    const picker = await screen.findByRole("dialog");
    await userEvent.click(within(picker).getByRole("button", { name: "Love" }));
    // The picker is still fading out, and its own "Love" choice has the same
    // name as the action. Only the action carries `aria-expanded`.
    expect(
      screen.getByRole("button", { name: "Love", expanded: false }),
    ).toBeVisible();

    // A rollback lands as a new object with the same `myKind` as before the
    // tap, so only the object itself says the tap has been undone.
    rerender(<Reactions reactions={{ ...SUMMARY }} viewer={VIEWER} />);

    expect(
      screen.getByRole("button", { name: "React", expanded: false }),
    ).toBeVisible();
  });
});
