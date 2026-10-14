import { type ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";

type Props = { media: MediaRef; onFailure: () => void };

/** Renders the authorized explicit playback source with its catalog MIME type. */
export function VideoSources({ media, onFailure }: Readonly<Props>): ReactNode {
  const sources =
    media.playback === null
      ? []
      : [{ url: media.playback.url, type: media.playback.contentType }];
  return sources.map(({ url, type }) => {
    return <source key={url} src={url} type={type} onError={onFailure} />;
  });
}
