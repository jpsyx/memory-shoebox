import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { MediaRef } from "@memory-shoebox/shared";
import { createRef, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { VideoFrame } from "@/system/VideoFrame/VideoFrame";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _source(url: string) {
  return {
    url,
    expiresAt: "2026-09-28T13:00:00.000Z",
    width: 800,
    height: 600,
  };
}

const MEDIA: MediaRef = {
  thumb: _source("https://example.test/t.jpg"),
  display: _source("https://example.test/d.jpg"),
  poster: null,
  video: null,
  durationMs: null,
  altText: "Mateo on the day he was born",
};

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("the video frame", () => {
  it("renders its transport with a clock and a play control", () => {
    _render(
      <VideoFrame
        media={{ ...MEDIA, durationMs: 22_000 }}
        marks={[]}
        videoRef={createRef<HTMLVideoElement>()}
      />,
    );

    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
    expect(screen.getByText("0:00 / 0:00")).toBeVisible();
  });
});
