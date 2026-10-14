import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaPlaceholder } from "./MediaPlaceholder";
describe("MediaPlaceholder", () => {
  it.each([
    { state: "pending" as const, label: "Preparing" },
    { state: "unavailable" as const, label: "Unavailable" },
  ])(
    "keeps $state status concise in a fixed compact media box",
    ({ state, label }) => {
      render(
        <MediaPlaceholder
          altText="A fixed strip preview"
          width={600}
          height={800}
          state={state}
          isCompact
        />,
      );
      expect(screen.getByText(label, { exact: true })).toBeVisible();
      expect(
        screen.queryByText(
          state === "pending" ? "Preparing preview" : "Preview unavailable",
        ),
      ).toBeNull();
    },
  );
  it("announces pending previews and retains oriented layout", () => {
    render(
      <MediaPlaceholder
        altText="A portrait"
        width={600}
        height={800}
        state="pending"
      />,
    );
    expect(screen.getByRole("img", { name: "A portrait" })).toHaveStyle({
      aspectRatio: "600 / 800",
    });
    expect(screen.getByText("Preparing preview")).toBeVisible();
  });
  it("announces unavailable previews without claiming queued work", () => {
    render(
      <MediaPlaceholder
        altText="A clip"
        width={1920}
        height={1080}
        state="unavailable"
      />,
    );
    expect(screen.getByRole("img", { name: "A clip" })).toBeVisible();
    expect(screen.getByText("Preview unavailable")).toBeVisible();
    expect(screen.queryByText("Preparing preview")).toBeNull();
  });
});
