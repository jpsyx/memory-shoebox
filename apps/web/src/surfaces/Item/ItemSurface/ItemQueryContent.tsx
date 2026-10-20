import type { UseQueryResult } from "@tanstack/react-query";
import type { ItemDetail, MediaPreview } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { TheaterMode } from "../ItemTheater/useTheaterMode/useTheaterMode";
import type { VideoTransport } from "../ItemViewer/useVideoTransport";
import { ItemFailed } from "./ItemFailed";
import { ItemLoading } from "./ItemLoading/ItemLoading";
import { ItemNotHere } from "./ItemNotHere";
import { ItemViewer } from "../ItemViewer/ItemViewer";

type Props = {
  theater: TheaterMode;
  transport: VideoTransport;
  query: UseQueryResult<ItemDetail, Error>;
  isNotHere: boolean;
  selectedPreview: MediaPreview | undefined;
  viewer: Viewer;
  timezone: string;
};
/** Renders authorized, inert preview, loading and failed detail-query states. */
export function ItemQueryContent(options: Readonly<Props>): ReactNode {
  return options.isNotHere ? (
    <ItemNotHere />
  ) : options.query.data === undefined || options.query.isError ? (
    options.query.isError ? (
      <ItemFailed
        onRetry={() => {
          void options.query.refetch();
        }}
      />
    ) : (
      <ItemLoading preview={options.selectedPreview} />
    )
  ) : (
    <ItemViewer
      selectedPreview={options.selectedPreview}
      detail={options.query.data}
      isPlaceholder={options.query.isPlaceholderData}
      viewer={options.viewer}
      timezone={options.timezone}
      theater={options.theater}
      transport={options.transport}
    />
  );
}
