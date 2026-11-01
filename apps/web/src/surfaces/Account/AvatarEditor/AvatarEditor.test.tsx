import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { removePrivateQueries } from "@/api/me/privateQueryHelpers";
import * as avatarsApi from "@/api/avatars/avatars";
import { createMeResponse } from "@/testing/createMeResponse";
import * as helpers from "./avatarCropHelpers/avatarCropHelpers";
import { AvatarEditor } from "./AvatarEditor";
const avatar = {
  avatarId: "018f0000-0000-7000-8000-000000000010",
  url: "https://example.com/old",
  issuedAt: "2026-10-31T00:00:00.000Z",
  expiresAt: "2099-10-31T01:00:00.000Z",
};
beforeEach(() => {
  vi.spyOn(helpers, "getDimensionsFromAvatarUrl").mockResolvedValue({
    width: 101,
    height: 57,
  });
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi
        .fn()
        .mockReturnValueOnce("blob:first")
        .mockReturnValue("blob:second");
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function _render() {
  const account = createMeResponse({ avatar });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  client.setQueryData(["me"], account);
  const onSaved = vi.fn();
  return {
    ...render(
      <QueryClientProvider client={client}>
        <MantineProvider>
          <AvatarEditor me={account.me} onSaved={onSaved} />
        </MantineProvider>
      </QueryClientProvider>,
    ),
    client,
    onSaved,
  };
}
async function _choose() {
  await userEvent.upload(
    screen.getByLabelText("Choose photo file"),
    new File(["pixels"], "face.png", { type: "image/png" }),
  );
  await screen.findByRole("slider", { name: "Photo zoom" });
}
it("keeps the old photo and selected crop after upload failure, then retries", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ avatarId: avatar.avatarId, expiresAt: avatar.expiresAt }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: "internal_error", message: "Failed" },
        { status: 500 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({ avatarId: avatar.avatarId, expiresAt: avatar.expiresAt }),
    )
    .mockResolvedValueOnce(
      Response.json(
        createMeResponse({
          avatar: { ...avatar, url: "https://example.com/new" },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const { onSaved } = _render();
  await _choose();
  await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
  expect(
    await screen.findByText("Couldn't save your photo. Try again."),
  ).toBeVisible();
  expect(
    screen.getAllByAltText("").some((image) => {
      return image.getAttribute("src") === avatar.url;
    }),
  ).toBe(true);
  expect(screen.getByRole("slider", { name: "Photo zoom" })).toHaveAttribute(
    "aria-valuenow",
    "1.1",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await screen.findByText("Photo saved.");
  expect(onSaved).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
});
it("keeps a failed removal and retries from a confirmation initially focused on Keep photo", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { error: "internal_error", message: "Failed" },
        { status: 500 },
      ),
    )
    .mockResolvedValueOnce(Response.json(createMeResponse()));
  vi.stubGlobal("fetch", fetcher);
  _render();
  await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Remove your photo?",
  });
  await vi.waitFor(() => {
    return expect(
      within(dialog).getByRole("button", { name: "Keep photo" }),
    ).toHaveFocus();
  });
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Remove photo" }),
  );
  expect(
    await screen.findByText("Couldn't save your photo. Try again."),
  ).toBeVisible();
  expect(screen.getByAltText("")).toHaveAttribute("src", avatar.url);
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Remove photo" }),
  );
  await screen.findByRole("button", { name: "Add a photo" });
  await vi.waitFor(() => {
    return expect(
      screen.getByRole("button", { name: "Add a photo" }),
    ).toHaveFocus();
  });
});
it("preserves a stale crop and fetches the latest expected version for an explicit replacement", async () => {
  const newer = { ...avatar, avatarId: "018f0000-0000-7000-8000-000000000011" };
  const saved = {
    ...avatar,
    avatarId: "018f0000-0000-7000-8000-000000000012",
    url: "https://example.com/saved",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { error: "avatar_changed", message: "Changed" },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ avatar: newer }))
    .mockResolvedValueOnce(
      Response.json({ avatarId: saved.avatarId, expiresAt: saved.expiresAt }),
    )
    .mockResolvedValueOnce(Response.json(createMeResponse({ avatar: saved })));
  vi.stubGlobal("fetch", fetcher);
  const rendered = _render();
  await _choose();
  await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await screen.findByText("Your photo changed in another window.");
  expect(
    screen.getByRole("button", { name: "Use latest photo" }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Save this photo instead" }),
  );
  await screen.findByText("Photo saved.");
  expect(JSON.parse(fetcher.mock.calls[2]![1].body).expectedAvatarId).toBe(
    newer.avatarId,
  );
  expect(
    rendered.client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])
      ?.me.member.avatar,
  ).toEqual(saved);
  expect(rendered.onSaved.mock.calls[0]?.[0].me.member.avatar).toEqual(saved);
});
it("revokes preview URLs on replacement, cancel and unmount", async () => {
  const rendered = _render();
  await _choose();
  await userEvent.click(
    screen.getByRole("button", { name: "Choose another photo" }),
  );
  await _choose();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
  await _choose();
  rendered.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
});
it("does not invoke onSaved after the account changes during a held PUT", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ avatarId: avatar.avatarId, expiresAt: avatar.expiresAt }),
    )
    .mockReturnValueOnce(pending.promise);
  vi.stubGlobal("fetch", fetcher);
  const rendered = _render();
  await _choose();
  await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await vi.waitFor(() => {
    return expect(fetcher).toHaveBeenCalledTimes(2);
  });
  rendered.client.setQueryData(
    ["me"],
    createMeResponse({ memberId: "018f0000-0000-7000-8000-000000000002" }),
  );
  await act(async () => {
    pending.resolve(Response.json(createMeResponse({ avatar })));
    await pending.promise;
  });
  expect(rendered.onSaved).not.toHaveBeenCalled();
});

it("uses the latest photo explicitly without uploading the preserved draft", async () => {
  const newer = {
    ...avatar,
    avatarId: "018f0000-0000-7000-8000-000000000011",
    url: "https://example.com/newer",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { error: "avatar_changed", message: "Changed" },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ avatar: newer }));
  vi.stubGlobal("fetch", fetcher);
  const rendered = _render();
  await _choose();
  await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await screen.findByRole("button", { name: "Use latest photo" });
  await userEvent.click(
    screen.getByRole("button", { name: "Use latest photo" }),
  );
  await vi.waitFor(() => {
    return expect(rendered.onSaved).toHaveBeenCalledOnce();
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    rendered.client.getQueryData<ReturnType<typeof createMeResponse>>(["me"])
      ?.me.member.avatar,
  ).toEqual(newer);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
});

it.each(["replacement", "retirement"] as const)(
  "retires overwrite between the latest read and continuation after account %s",
  async (change) => {
    const newer = {
      ...avatar,
      avatarId: "018f0000-0000-7000-8000-000000000011",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: "avatar_changed", message: "Changed" },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ avatar: newer }))
      .mockResolvedValue(
        Response.json(
          { error: "unexpected_write", message: "No write expected" },
          { status: 500 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const rendered = _render();
    const readLatest = avatarsApi.getLatestAvatarFromMember;
    vi.spyOn(avatarsApi, "getLatestAvatarFromMember").mockImplementation(
      (options) => {
        return readLatest(options).then((latest) => {
          queueMicrotask(() => {
            if (change === "replacement") {
              rendered.client.setQueryData(
                ["me"],
                createMeResponse({
                  memberId: "018f0000-0000-7000-8000-000000000002",
                }),
              );
            } else {
              removePrivateQueries(rendered.client);
            }
          });
          return latest;
        });
      },
    );
    await _choose();
    await userEvent.click(screen.getByRole("button", { name: "Save photo" }));
    await screen.findByRole("button", { name: "Save this photo instead" });
    await userEvent.click(
      screen.getByRole("button", { name: "Save this photo instead" }),
    );
    await vi.waitFor(() => {
      return expect(fetcher).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetcher.mock.calls.slice(2)).toHaveLength(0);
    expect(rendered.onSaved).not.toHaveBeenCalled();
  },
);
