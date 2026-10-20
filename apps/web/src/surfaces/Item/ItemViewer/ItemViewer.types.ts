import type { TheaterMode } from "../ItemTheater/useTheaterMode/useTheaterMode";
import type { VideoTransport } from "./useVideoTransport";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { ItemDetail, MediaPreview } from "@memory-shoebox/shared";

/** Authorized item data and presentation state shared by viewer children. */
export type Props = {
  detail: ItemDetail;
  selectedPreview?: MediaPreview;
  /** The item being left, drawn while the next one loads: it takes no write. */
  isPlaceholder: boolean;
  viewer: Viewer;
  timezone: string;
  theater: TheaterMode;
  transport: VideoTransport;
};

/** The same item tree in its ordinary page or fullscreen theater. */
export type ItemPresentation = "page" | "theater";
