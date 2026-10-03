import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";
import { Composer } from "@/system/Talk/Composer/Composer";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

/** The theme, around whatever is rendered. */
function _Providers({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  );
}

function _render(node: ReactNode) {
  return render(node, { wrapper: _Providers });
}

/**
 * A composer whose sends stay out until `land` is called, with `isSending`
 * held the way `useCreateComment` holds it.
 */
function _renderSending(): {
  onSend: Mock<(body: string) => void>;
  land: () => void;
} {
  const onSend = vi.fn<(body: string) => void>();
  let landTheSend = () => {};
  function Harness(): ReactNode {
    const [isSending, setIsSending] = useState(false);
    return (
      <Composer
        goesTo="x"
        isSending={isSending}
        onSend={({ body, onSent }) => {
          onSend(body);
          setIsSending(true);
          landTheSend = () => {
            setIsSending(false);
            onSent();
          };
        }}
      />
    );
  }
  _render(<Harness />);
  return {
    onSend,
    land: () => {
      landTheSend();
    },
  };
}

describe("the composer", () => {
  it("enables Send once there are words to send", async () => {
    _render(
      <Composer
        goesTo="This goes to everybody who can see it."
        isSending={false}
        onSend={() => {}}
      />,
    );

    const send = screen.getByRole("button", { name: /Send/ });
    expect(send).toHaveAttribute("aria-disabled", "true");

    await userEvent.type(
      screen.getByRole("textbox", { name: "Say something" }),
      "He has his mother's chin.",
    );

    expect(send).not.toHaveAttribute("aria-disabled");
  });

  it("keeps focus on Send while the words are out, then gives it to the field", async () => {
    const sending = _renderSending();

    const field = screen.getByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    const send = screen.getByRole("button", { name: "Send" });
    send.focus();
    await userEvent.keyboard("{Enter}");

    expect(send).toHaveTextContent("Sending");
    expect(send).toHaveFocus();
    expect(send).not.toBeDisabled();
    expect(send).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    expect(sending.onSend).toHaveBeenCalledOnce();

    act(() => {
      sending.land();
    });
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(send).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves focus alone when it moved on while the words were out", async () => {
    const sending = _renderSending();
    _render(<button type="button">Elsewhere</button>);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Say something" }),
      "He has his mother's chin.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();

    act(() => {
      sending.land();
    });
    expect(elsewhere).toHaveFocus();
  });

  it("sends the words, and clears them only once they have arrived", async () => {
    const onSend = vi.fn<ComponentProps<typeof Composer>["onSend"]>();
    _render(<Composer goesTo="x" isSending={false} onSend={onSend} />);

    const field = screen.getByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));

    expect(onSend).toHaveBeenCalledWith({
      body: "He has his mother's chin.",
      onSent: expect.any(Function),
    });
    expect(field).toHaveValue("He has his mother's chin.");

    act(() => {
      onSend.mock.calls[0]?.[0].onSent();
    });
    expect(field).toHaveValue("");
  });

  it("keeps what was typed while the send was on its way", async () => {
    const onSend = vi.fn<ComponentProps<typeof Composer>["onSend"]>();
    _render(<Composer goesTo="x" isSending={false} onSend={onSend} />);

    const field = screen.getByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    await userEvent.type(field, " And her eyes.");

    act(() => {
      onSend.mock.calls[0]?.[0].onSent();
    });
    expect(field).toHaveValue("He has his mother's chin. And her eyes.");
  });

  it("shows the error it is given and keeps the words while no onSent comes", async () => {
    _render(
      <Composer
        goesTo="x"
        isSending={false}
        onSend={() => {}}
        error="It did not send. It is still here, so try again."
      />,
    );

    const field = screen.getByRole("textbox", { name: "Say something" });
    await userEvent.type(field, "He has his mother's chin.");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("It did not send.");
    expect(field).toHaveValue("He has his mother's chin.");
  });

  it("says where a pinned comment will stand", () => {
    _render(
      <Composer
        goesTo="x"
        isSending={false}
        onSend={() => {}}
        pinnedAt={4}
        onClearPin={() => {}}
      />,
    );

    expect(
      screen.getByRole("textbox", { name: "Say something at 0:04" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Unpin" })).toBeVisible();
  });
});
