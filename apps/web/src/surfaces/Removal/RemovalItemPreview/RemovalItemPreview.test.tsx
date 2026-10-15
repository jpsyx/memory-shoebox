import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import type { ItemSummary } from "@memory-shoebox/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RemovalItemPreview } from "./RemovalItemPreview";
const ITEM = makeItemSummaryFromOverrides() satisfies ItemSummary;
describe("the asking item thumbnail", () => {
  it("replaces a failed signed thumbnail with an unavailable presentation", () => {
    render(<RemovalItemPreview item={ITEM} timezone="Europe/Madrid" />);
    fireEvent.error(screen.getByRole("img", { name: ITEM.media.altText }));
    expect(screen.getByRole("img")).not.toHaveAttribute("src");
    expect(screen.getByText("Preview unavailable")).toBeVisible();
    expect(screen.getByText(/Uploaded by Mamá/)).toBeVisible();
  });
  it("tries a refreshed signed URL after the previous thumbnail failed", () => {
    const { rerender } = render(
      <RemovalItemPreview item={ITEM} timezone="Europe/Madrid" />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).not.toHaveAttribute("src");
    const freshItem = {
      ...ITEM,
      media: {
        ...ITEM.media,
        thumb: {
          ...ITEM.media.thumb!,
          url: "https://example.invalid/fresh.jpg?signature=new",
        },
      },
    };
    rerender(<RemovalItemPreview item={freshItem} timezone="Europe/Madrid" />);
    expect(
      screen.getByRole("img", { name: ITEM.media.altText }),
    ).toHaveAttribute("src", freshItem.media.thumb!.url);
    expect(screen.queryByText("Preview unavailable")).toBeNull();
  });
});

it("preserves pending when both the thumbnail and failed URL are absent", () => {
  render(
    <RemovalItemPreview
      item={{
        ...ITEM,
        media: { ...ITEM.media, thumb: null, previewState: "pending" },
      }}
      timezone="Europe/Madrid"
    />,
  );
  expect(screen.queryByText("Preview unavailable")).toBeNull();
  expect(screen.getByText("Preparing preview")).toBeVisible();
});
