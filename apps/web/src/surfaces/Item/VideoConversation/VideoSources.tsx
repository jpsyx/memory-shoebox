import { useRef, type ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";

type Props = { media: MediaRef; onFailure: () => void };

/** Native source fallback reports an error only after every encoding fails. */
export function VideoSources({ media, onFailure }: Readonly<Props>): ReactNode {
  const failedTypes = useRef(new Set<string>());
  const sources = [
    { source: media.video?.webm, type: "video/webm" },
    { source: media.video?.mp4, type: "video/mp4" },
  ].flatMap(({ source, type }) => {
    return source == null ? [] : [{ url: source.url, type }];
  });
  return sources.map(({ url, type }) => {
    return (
      <source
        key={url}
        src={url}
        type={type}
        onError={() => {
          failedTypes.current.add(type);
          if (failedTypes.current.size >= sources.length) {
            onFailure();
          }
        }}
      />
    );
  });
}
