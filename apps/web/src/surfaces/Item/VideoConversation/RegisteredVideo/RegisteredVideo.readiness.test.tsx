import {
  PhotoReadinessContext,
  type ViewerReadiness,
} from "@/media/PhotoReadinessContext";
import { makeVideoDetail } from "@/testing/itemFixtureHelpers";
import { fireEvent, render, screen } from "@testing-library/react";
import { Container } from "@videojs/react";
import { VideoPlayer } from "@videojs/react/video";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoTransport } from "../../ItemViewer/useVideoTransport";
import { useVideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import { RegisteredVideo } from "./RegisteredVideo";

const detail = makeVideoDetail();
type Props = { version: number };

function Player({ version }: Readonly<Props>): ReactNode {
  const [readiness, setReadiness] = useState<ViewerReadiness>();
  const transport = useVideoTransport(detail.itemId);
  const playback = useVideoPlayback({
    media: detail.media,
    transport,
    reactions: [],
    lastAdded: undefined,
  });
  return (
    <PhotoReadinessContext value={setReadiness}>
      <VideoPlayer>
        <Container>
          <RegisteredVideo
            key={version}
            itemId={detail.itemId}
            media={detail.media}
            playback={playback}
            transport={transport}
          />
        </Container>
      </VideoPlayer>
      <output>
        {readiness === undefined
          ? "waiting"
          : readiness.photosReady
            ? "photos"
            : "posters"}
      </output>
    </PhotoReadinessContext>
  );
}

describe("native video readiness ownership", () => {
  beforeEach(() => {
    // jsdom exposes track arrays, but these browser interfaces are
    // EventTargets.
    vi.spyOn(HTMLMediaElement.prototype, "audioTracks", "get").mockReturnValue(
      undefined as never,
    );
    vi.spyOn(HTMLMediaElement.prototype, "videoTracks", "get").mockReturnValue(
      undefined as never,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("follows the replacement media element after retry and ignores its retired predecessor", () => {
    const view = render(<Player version={0} />);
    const oldVideo = view.container.querySelector("video")!;
    Object.defineProperty(oldVideo, "readyState", {
      configurable: true,
      value: 1,
    });
    fireEvent.loadedMetadata(oldVideo);
    expect(screen.getByRole("status")).toHaveTextContent("posters");
    view.rerender(<Player version={1} />);
    const video = view.container.querySelector("video")!;
    expect(video).not.toBe(oldVideo);
    fireEvent.loadedMetadata(oldVideo);
    expect(screen.getByRole("status")).toHaveTextContent("waiting");
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 2,
    });
    fireEvent.loadedData(video);
    expect(screen.getByRole("status")).toHaveTextContent("photos");
  });
});
