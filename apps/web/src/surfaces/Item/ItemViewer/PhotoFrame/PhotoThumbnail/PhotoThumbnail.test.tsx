import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtures";
import { PhotoThumbnail } from "./PhotoThumbnail";

it("keeps an explicit unavailable fallback for an unsupported AVIF thumbnail", () => {
  const media = {
    ...makeItemDetail().media,
    thumb: makeMediaSource({ contentType: "image/avif" }),
  };
  const view = render(
    <PhotoThumbnail
      media={media}
      viewport={{
        cssWidth: 400,
        cssHeight: 500,
        devicePixelRatio: 1,
        supportsWebp: false,
        supportsAvif: false,
      }}
    />,
  );
  expect(view.container.querySelector("img")).toBeNull();
  expect(
    screen.getByRole("img", { name: media.altText }),
  ).toHaveAccessibleDescription("Preview unavailable");
});
