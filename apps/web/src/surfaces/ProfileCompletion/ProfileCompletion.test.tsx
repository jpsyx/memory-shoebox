import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import { meQueryOptions } from "@/api/me/me";
import * as avatarHelpers from "@/surfaces/Account/AvatarEditor/avatarCropHelpers/avatarCropHelpers";
import { ProfileCompletion } from "./ProfileCompletion";

function _render(redirect = "/items/photo?comment=thread") {
  const account = createMeResponse({
    storedDisplayName: null,
    email: "private@example.com",
  });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  client.setQueryData(meQueryOptions.queryKey, account);
  const onContinue = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <ProfileCompletion
          account={account}
          redirect={redirect}
          onContinue={onContinue}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { client, onContinue };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("saves a raw name and preserves the complete safe local destination", async () => {
  const fetcher = vi.fn(async (_path: string, _init?: RequestInit) => {
    return Response.json(createMeResponse({ displayName: "John M" }));
  });
  vi.stubGlobal("fetch", fetcher);
  const { onContinue } = _render();
  const input = screen.getByLabelText("Your name");
  expect(input).toHaveValue("");
  expect(input).not.toHaveAttribute("placeholder", "private");
  await userEvent.type(input, "John M");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await vi.waitFor(() => {
    return expect(onContinue).toHaveBeenCalledWith(
      "/items/photo?comment=thread",
    );
  });
  expect(
    JSON.parse(fetcher.mock.calls[0]![1]!.body as string).displayName,
  ).toBe("John M");
});
it("keeps a conflicting draft, focuses it and retries", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "name_taken", message: "Taken" }, { status: 409 }),
    )
    .mockResolvedValueOnce(
      Response.json(createMeResponse({ displayName: "John M" })),
    );
  vi.stubGlobal("fetch", fetcher);
  const { onContinue } = _render("//external.example");
  const input = screen.getByLabelText("Your name");
  await userEvent.type(input, "John");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    await screen.findByText(
      "That name is already taken. Try adding your last-name initial, like John M.",
    ),
  ).toBeVisible();
  expect(input).toHaveValue("John");
  expect(input).toHaveFocus();
  await userEvent.type(input, " M");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await vi.waitFor(() => {
    return expect(onContinue).toHaveBeenCalledWith("/");
  });
});

it("preserves draft edits after a failed request and blocks duplicate pending submissions", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi.fn(() => {
    return pending.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  _render();
  const input = screen.getByLabelText("Your name");
  await userEvent.type(input, "John");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
  await userEvent.type(input, " M");
  pending.resolve(
    Response.json(
      { error: "internal_error", message: "Failed" },
      { status: 500 },
    ),
  );
  expect(
    await screen.findByText(
      "Couldn't save your name. Your changes are still here.",
    ),
  ).toBeVisible();
  expect(input).toHaveValue("John M");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("retires an expired draft and preserves the original destination for sign-in", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return Response.json(
        { error: "not_signed_in", message: "Expired" },
        { status: 401 },
      );
    }),
  );
  const { onContinue, client } = _render();
  await userEvent.type(screen.getByLabelText("Your name"), "John");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await vi.waitFor(() => {
    return expect(onContinue).toHaveBeenCalledWith(
      "/sign-in?redirect=%2Fitems%2Fphoto%3Fcomment%3Dthread&expired=true",
    );
  });
  expect(client.getQueryData(meQueryOptions.queryKey)).toBeUndefined();
  expect(screen.getByLabelText("Your name")).toHaveValue("");
});
it("does not publish a held completion into a different account", async () => {
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return pending.promise;
    }),
  );
  const { client, onContinue } = _render();
  await userEvent.type(screen.getByLabelText("Your name"), "John");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  const other = createMeResponse({
    avatar: null,
    memberId: "018f0000-0000-7000-8000-000000000001",
    displayName: "Another",
  });
  client.setQueryData(meQueryOptions.queryKey, other);
  pending.resolve(Response.json(createMeResponse({ displayName: "John" })));
  await screen.findByRole("button", { name: "Continue" });
  expect(onContinue).not.toHaveBeenCalled();
  expect(client.getQueryData(meQueryOptions.queryKey)).toEqual(other);
});
it.each([
  ["", "Enter the name your family knows you by."],
  ["@John", "Use your name without @ or line breaks."],
  ["x".repeat(81), "Keep your name to 80 characters or fewer."],
])("validates the name before saving %s", async (name, error) => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  _render();
  if (name) await userEvent.type(screen.getByLabelText("Your name"), name);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText(error)).toBeVisible();
  expect(screen.getByLabelText("Your name")).toHaveFocus();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["retry", "skip"] as const)(
  "claims a name before an optional staged photo and can %s a failed photo",
  async (recovery) => {
    vi.spyOn(avatarHelpers, "getDimensionsFromAvatarUrl").mockResolvedValue({
      width: 101,
      height: 57,
    });
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => {
          return "blob:staged";
        });
        static revokeObjectURL = vi.fn();
      },
    );
    const avatar = {
      avatarId: "018f0000-0000-7000-8000-000000000010",
      url: "https://example.com/photo",
      issuedAt: "2026-10-31T00:00:00.000Z",
      expiresAt: "2099-10-31T01:00:00.000Z",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(createMeResponse({ displayName: "John M" })),
      )
      .mockResolvedValueOnce(
        Response.json({
          avatarId: avatar.avatarId,
          expiresAt: avatar.expiresAt,
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: "internal_error", message: "Failed" },
          { status: 500 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          avatarId: avatar.avatarId,
          expiresAt: avatar.expiresAt,
        }),
      )
      .mockResolvedValueOnce(
        Response.json(createMeResponse({ storedDisplayName: null, avatar })),
      );
    vi.stubGlobal("fetch", fetcher);
    const { client, onContinue } = _render();
    await userEvent.type(screen.getByLabelText("Your name"), "John M");
    await userEvent.upload(
      screen.getByLabelText("Choose photo file"),
      new File(["pixels"], "face.png", { type: "image/png" }),
    );
    await screen.findByRole("slider", { name: "Photo zoom" });
    await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
    expect(fetcher).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Continue without a photo" });
    expect(onContinue).not.toHaveBeenCalled();
    expect(
      client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me
        .profileComplete,
    ).toBe(true);
    await userEvent.click(
      screen.getByRole("button", {
        name: recovery === "retry" ? "Try again" : "Continue without a photo",
      }),
    );
    await vi.waitFor(() => {
      return expect(onContinue).toHaveBeenCalledWith(
        "/items/photo?comment=thread",
      );
    });
    expect(
      client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])?.me
        .member.displayName,
    ).toBe("John M");
  },
);

it("retains a staged crop and name draft independently after a name conflict", async () => {
  vi.spyOn(avatarHelpers, "getDimensionsFromAvatarUrl").mockResolvedValue({
    width: 101,
    height: 57,
  });
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => {
        return "blob:staged";
      });
      static revokeObjectURL = vi.fn();
    },
  );
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: "name_taken", message: "Taken" }, { status: 409 }),
    );
  vi.stubGlobal("fetch", fetcher);
  const { onContinue } = _render();
  await userEvent.type(screen.getByLabelText("Your name"), "John");
  expect(screen.getByText("J")).toBeVisible();
  await userEvent.upload(
    screen.getByLabelText("Choose photo file"),
    new File(["pixels"], "face.png", { type: "image/png" }),
  );
  await screen.findByRole("slider", { name: "Photo zoom" });
  await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText(
    "That name is already taken. Try adding your last-name initial, like John M.",
  );
  expect(screen.getByLabelText("Your name")).toHaveValue("John");
  expect(
    screen.getAllByAltText("").every((image) => {
      return image.getAttribute("src") === "blob:staged";
    }),
  ).toBe(true);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  expect(onContinue).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
