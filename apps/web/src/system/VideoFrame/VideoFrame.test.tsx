import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MediaRef } from "@memory-shoebox/shared";
import { useRef, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { VideoFrame, type TransportMark } from "@/system/VideoFrame/VideoFrame";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _source(url: string) {
  return {
    url,
    expiresAt: "2099-01-01T00:00:00.000Z",
    width: 800,
    height: 600,
  };
}

const MEDIA: MediaRef = {
  thumb: _source("https://example.test/t.jpg"),
  display: _source("https://example.test/d.jpg"),
  poster: null,
  video: null,
  durationMs: 22_000,
  altText: "Mateo on the day he was born",
};

const MARK: TransportMark = {
  id: "c1",
  atSeconds: 11,
  label: "Jump to Abuela Rosa's comment at 0:11",
};

type Props = {
  marks?: readonly TransportMark[];
  durationMs?: number | null;
  initialPosition?: number;
  onScrub?: (seconds: number) => void;
  onPositionChange?: (seconds: number) => void;
};

/** Holds the position the way the item viewer does, so keys can move it. */
function Harness({
  marks = [],
  durationMs = 22_000,
  initialPosition = 0,
  onScrub,
  onPositionChange,
}: Readonly<Props>): ReactNode {
  const [position, setPosition] = useState(initialPosition);
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <VideoFrame
      media={{ ...MEDIA, durationMs }}
      marks={marks}
      videoRef={videoRef}
      position={position}
      onPositionChange={(seconds) => {
        setPosition(seconds);
        onPositionChange?.(seconds);
      }}
      onScrub={onScrub}
    />
  );
}

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("the video frame", () => {
  it("reads the clock against the contract's duration before anything loads", () => {
    _render(<Harness />);

    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
    expect(screen.getByText("0:00 / 0:22")).toBeVisible();
  });

  it("plays on Play, says Pause once it is playing, and pauses on Pause", async () => {
    const { container } = _render(<Harness />);
    const video = container.querySelector("video");
    if (video === null) {
      throw new Error("No video drawn");
    }
    // jsdom plays nothing, so the element's three parts are stood in for.
    let isPaused = true;
    Object.defineProperty(video, "paused", {
      get: () => {
        return isPaused;
      },
    });
    const play = vi.spyOn(video, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(video, "pause").mockImplementation(() => {});

    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledOnce();

    isPaused = false;
    fireEvent.play(video);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
  });

  it("tells a screen reader who is in it, as a photograph's alt text does", () => {
    _render(<Harness />);

    expect(screen.getByLabelText(MEDIA.altText).tagName).toBe("VIDEO");
  });

  it("places a pinned comment's mark on first paint, from durationMs", () => {
    _render(<Harness marks={[MARK]} />);

    expect(screen.getByRole("button", { name: MARK.label })).toHaveStyle({
      left: "50%",
    });
  });

  it("draws no mark when it cannot know how long the video is", () => {
    _render(<Harness marks={[MARK]} durationMs={null} />);

    expect(screen.queryByRole("button", { name: MARK.label })).toBeNull();
  });

  it("moves a second at a time with the arrow keys, and says where it is", async () => {
    const onScrub = vi.fn();
    _render(<Harness onScrub={onScrub} />);

    const slider = screen.getByRole("slider", { name: "Where in the video" });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");

    expect(slider).toHaveAttribute("aria-valuetext", "0:02 of 0:22");
    expect(onScrub).toHaveBeenLastCalledWith(2);
  });

  it("moves the video itself, not only the clock", async () => {
    const { container } = _render(<Harness />);

    screen.getByRole("slider", { name: "Where in the video" }).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");

    expect(container.querySelector("video")?.currentTime).toBe(3);
  });

  it("never reads past the end, whatever position it is handed", () => {
    _render(<Harness initialPosition={30} />);

    expect(
      screen.getByRole("slider", { name: "Where in the video" }),
    ).toHaveAttribute("aria-valuetext", "0:22 of 0:22");
    expect(screen.getByText("0:22 / 0:22")).toBeVisible();
  });

  it("goes to either end with End and Home", async () => {
    _render(<Harness />);

    const slider = screen.getByRole("slider", { name: "Where in the video" });
    slider.focus();
    await userEvent.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuetext", "0:22 of 0:22");
    await userEvent.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuetext", "0:00 of 0:22");
  });

  it("seeks where the bar is pressed", () => {
    const onScrub = vi.fn();
    _render(<Harness onScrub={onScrub} />);

    const slider = screen.getByRole("slider", { name: "Where in the video" });
    const box = slider.getBoundingClientRect();
    fireEvent.click(slider, { clientX: box.left + box.width / 2 });

    expect(onScrub).toHaveBeenCalledWith(11);
  });

  it("seeks to a mark without counting as a press on the bar", async () => {
    const onScrub = vi.fn();
    const onPositionChange = vi.fn();
    _render(
      <Harness
        marks={[MARK]}
        onScrub={onScrub}
        onPositionChange={onPositionChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: MARK.label }));

    expect(onPositionChange).toHaveBeenCalledWith(11);
    expect(onScrub).not.toHaveBeenCalled();
  });
});
