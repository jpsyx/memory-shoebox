import type { RemovalResolvedEmailPayload } from "@memory-shoebox/shared";

/** Catalog delivery state plus its validated frozen message. */
export type QueuedRemovalMail = {
  state: string;
  payload: RemovalResolvedEmailPayload;
};
