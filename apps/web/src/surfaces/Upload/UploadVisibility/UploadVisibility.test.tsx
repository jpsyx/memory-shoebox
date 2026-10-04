import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import { UploadVisibility } from "./UploadVisibility";
describe("upload visibility", () => {
  it("saved visibility survives directory failure and keeps the viewer available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ error: "not_found", message: "Unavailable" }),
          { status: 404 },
        );
      }),
    );
    const saved = {
      ...makeUploadSessionDetail().visibility,
      mode: "only" as const,
      subjects: [
        {
          kind: "member" as const,
          id: "018f0000-0000-7000-8000-000000000003",
          displayName: "Abuela",
        },
      ],
    };
    const onChange = vi.fn();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MantineProvider>
          <UploadVisibility
            choice={{
              mode: "only",
              subjects: [{ kind: "member", id: saved.subjects[0]!.id }],
            }}
            saved={saved}
            viewer={{
              memberId: "018f0000-0000-7000-8000-000000000001",
              displayName: "Papá",
            }}
            onChange={onChange}
          />
        </MantineProvider>
      </QueryClientProvider>,
    );
    await screen.findByText(
      "Some visibility choices are unavailable. Your saved restriction is still in place.",
    );
    expect(
      screen
        .getByRole("combobox", { name: "Only these" })
        .closest(".mantine-MultiSelect-root"),
    ).toHaveTextContent("Abuela");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "Only these" }));
    expect(await screen.findByRole("option", { name: /Papá/ })).toBeVisible();
  });
  it("unfinished Only and Except explain why submission cannot proceed", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MantineProvider>
          <UploadVisibility
            choice={{ mode: "except", subjects: [] }}
            saved={makeUploadSessionDetail().visibility}
            viewer={makeUploadSessionDetail().uploadedBy}
            onChange={vi.fn()}
          />
        </MantineProvider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByText("Name a person or group first, or choose Everyone."),
    ).toBeVisible();
  });
});
