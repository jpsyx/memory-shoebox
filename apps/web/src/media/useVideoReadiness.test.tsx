import { useRef, useState, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useVideoReadiness } from "./useVideoReadiness";
import type { ViewerReadiness } from "./PhotoReadinessContext";

function Viewer(): ReactNode {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState<ViewerReadiness>();
  useVideoReadiness({
    itemId: "video",
    enabled: true,
    videoRef,
    onReady: setReady,
  });
  return (
    <>
      <video ref={videoRef} />
      <output>
        {ready === undefined
          ? "waiting"
          : ready.photosReady
            ? "photos"
            : "posters"}
      </output>
    </>
  );
}

describe("selected video readiness", () => {
  it("waits for a first frame plus two buffered seconds or pause, including near the end", () => {
    const { container } = render(<Viewer />);
    const video = container.querySelector("video")!;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 1 },
      paused: { configurable: true, value: false },
      currentTime: { configurable: true, value: 9 },
      duration: { configurable: true, value: 10 },
      buffered: {
        configurable: true,
        value: {
          length: 1,
          start: () => {
            return 0;
          },
          end: () => {
            return 10;
          },
        },
      },
    });
    fireEvent.loadedMetadata(video);
    expect(screen.getByRole("status")).toHaveTextContent("posters");
    Object.defineProperty(video, "readyState", { value: 2 });
    fireEvent.loadedData(video);
    expect(screen.getByRole("status")).toHaveTextContent("posters");
    Object.defineProperty(video, "currentTime", { value: 8 });
    fireEvent.progress(video);
    expect(screen.getByRole("status")).toHaveTextContent("photos");
    Object.defineProperty(video, "currentTime", { value: 9 });
    fireEvent.timeUpdate(video);
    expect(screen.getByRole("status")).toHaveTextContent("posters");
    Object.defineProperty(video, "paused", { value: true });
    fireEvent.pause(video);
    expect(screen.getByRole("status")).toHaveTextContent("photos");
  });
});
