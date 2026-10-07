import { useRef, type ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";

type Props = { media: MediaRef; onFailure: () => void };

/** Uses generated encodings when present, otherwise the uploaded original. */
export function VideoSources({ media, onFailure }: Readonly<Props>): ReactNode {
  const failedUrls = useRef(new Set<string>());
  const encodings = [
    { source: media.video?.webm, type: "video/webm" },
    { source: media.video?.mp4, type: "video/mp4" },
  ].flatMap(({ source, type }) => {
    return source == null ? [] : [{ url: source.url, type }];
  });
  const sources =
    encodings.length > 0
      ? encodings
      : [{ url: media.display.url, type: undefined }];
  return sources.map(({ url, type }) => {
    return (
      <source
        key={url}
        src={url}
        type={type}
        onError={() => {
          failedUrls.current.add(url);
          if (failedUrls.current.size >= sources.length) {
            onFailure();
          }
        }}
      />
    );
  });
}
