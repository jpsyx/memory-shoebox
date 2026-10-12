import { z } from "zod";

/** Version 1: DCT hash, horizontal gradients and an 8x8 RGB color grid. */
export const visualFingerprintSchema = z
  .string()
  .regex(/^v1:[0-9a-f]{16}:[0-9a-f]{60}:[0-9a-f]{384}$/);

/** Decode dimensions shared by browser and server fingerprint readers. */
export const VISUAL_FINGERPRINT_SIDE = 32;
