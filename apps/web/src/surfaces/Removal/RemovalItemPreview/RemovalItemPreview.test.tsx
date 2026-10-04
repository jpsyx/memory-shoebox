import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtures";
import { RemovalItemPreview } from "./RemovalItemPreview";
const ITEM = makeItemSummaryFromOverrides();
describe("the asking item thumbnail", () => {
  it("replaces a failed signed thumbnail with an unavailable presentation", () => {
    render(<RemovalItemPreview item={ITEM} timezone="Europe/Madrid" />);
    fireEvent.error(screen.getByRole("img", { name: ITEM.media.altText }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.getByText(/Uploaded by Mamá/)).toBeVisible();
  });
  it("tries a refreshed signed URL after the previous thumbnail failed", () => {
    const { rerender } = render(
      <RemovalItemPreview item={ITEM} timezone="Europe/Madrid" />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    const freshItem = {
      ...ITEM,
      media: {
        ...ITEM.media,
        thumb: {
          ...ITEM.media.thumb,
          url: "https://example.invalid/fresh.jpg?signature=new",
        },
      },
    };
    rerender(<RemovalItemPreview item={freshItem} timezone="Europe/Madrid" />);
    expect(
      screen.getByRole("img", { name: ITEM.media.altText }),
    ).toHaveAttribute("src", freshItem.media.thumb.url);
    expect(screen.queryByText("Unavailable")).toBeNull();
  });
});
