/**
 * The demonstration media catalog.
 *
 * The photographs and the clip are generated cartoon artwork, committed under
 * `prototypes/public/media/web/` and written by
 * `pnpm --filter @memory-shoebox/prototypes media`. Nothing here is a real
 * family file. Nothing here is product data either: every caption, name and
 * count elsewhere in `src/data/fixtures.ts` is written demonstration content.
 */

export type MediaKind = "photo" | "video";

export interface MediaRef {
  readonly id: string;
  readonly kind: MediaKind;
  /** The display file. Full size for the viewer. */
  readonly src: string;
  /** The pile file. A smaller derivative of the full image. */
  readonly thumb: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  /** Videos only. */
  readonly runtime?: string;
  readonly poster?: string;
  readonly sources?: ReadonlyArray<{ src: string; type: string }>;
}

/** The landscape frame the archive opens on. */
export const NEWBORN: MediaRef = {
  id: "m-newborn",
  kind: "photo",
  src: "/media/web/arrival.jpg",
  thumb: "/media/web/arrival-thumb.jpg",
  width: 1600,
  height: 1067,
  alt: "A cartoon baby wrapped in a blanket, just arrived.",
};

/** A second landscape frame, from later in the day. */
export const MORNING: MediaRef = {
  id: "m-morning",
  kind: "photo",
  src: "/media/web/highChair.jpg",
  thumb: "/media/web/highChair-thumb.jpg",
  width: 1600,
  height: 1067,
  alt: "A cartoon baby in a high chair, a bowl set on the tray.",
};

/** The one portrait frame at full size. */
export const UPRIGHT: MediaRef = {
  id: "m-upright",
  kind: "photo",
  src: "/media/web/pram.jpg",
  thumb: "/media/web/pram-thumb.jpg",
  width: 1067,
  height: 1600,
  alt: "A cartoon baby out for a walk in its pram.",
};

/** The one video in the demonstration set. */
export const CLIP: MediaRef = {
  id: "m-first-steps",
  kind: "video",
  src: "/media/web/first-steps.mp4",
  thumb: "/media/web/first-steps-thumb.jpg",
  poster: "/media/web/first-steps-poster.jpg",
  width: 960,
  height: 640,
  runtime: "0:10",
  alt: "A cartoon baby taking its first steps.",
  sources: [
    { src: "/media/web/first-steps.webm", type: "video/webm" },
    { src: "/media/web/first-steps.mp4", type: "video/mp4" },
  ],
};

/**
 * One frame of the burst. Forty-five of these were taken seconds apart, which
 * is exactly the case the stack exists to absorb.
 */
export function createBurstFrame(frameNumber: number): MediaRef {
  const padded = String(frameNumber).padStart(3, "0");
  return {
    id: `m-burst-${padded}`,
    kind: "photo",
    src: `/media/web/burst_${padded}.jpg`,
    thumb: `/media/web/burst_${padded}-thumb.jpg`,
    width: 1600,
    height: 1067,
    alt: "One of forty-five near-identical cartoon frames of a birthday candle.",
  };
}

/** The run the stack exists for: forty-five near-identical cartoon frames. */
export const BURST_FRAMES: readonly MediaRef[] = Array.from(
  { length: 45 },
  (_unused, index) => {
    return createBurstFrame(index + 1);
  },
);

/**
 * The eight generated stills, reused here to fill out the pile beyond the
 * dedicated frames above. Real shapes are recorded because the pile crops
 * nothing: every print claims the height its own orientation needs.
 */
const VARIED_SCENES: ReadonlyArray<{
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}> = [
  {
    file: "arrival",
    width: 1600,
    height: 1067,
    alt: "A cartoon baby wrapped in a blanket, just arrived.",
  },
  {
    file: "cot",
    width: 1600,
    height: 1067,
    alt: "A cartoon nursery scene, the baby settled in its cot.",
  },
  {
    file: "bath",
    width: 1067,
    height: 1600,
    alt: "A cartoon bath scene, bubbles floating around the baby.",
  },
  {
    file: "highChair",
    width: 1600,
    height: 1067,
    alt: "A cartoon baby in a high chair, a bowl set on the tray.",
  },
  {
    file: "pram",
    width: 1067,
    height: 1600,
    alt: "A cartoon baby out for a walk in its pram.",
  },
  {
    file: "firstSteps",
    width: 1067,
    height: 1600,
    alt: "A cartoon baby mid-step, learning to walk.",
  },
  {
    file: "cake",
    width: 1600,
    height: 1067,
    alt: "A cartoon birthday scene, a cake and two balloons.",
  },
  {
    file: "beach",
    width: 1600,
    height: 1067,
    alt: "A cartoon beach scene, the baby beside the sea.",
  },
];

export const VARIED_FRAMES: readonly MediaRef[] = VARIED_SCENES.map(
  (scene, index) => {
    const padded = String(index + 1).padStart(2, "0");
    return {
      id: `m-varied-${padded}`,
      kind: "photo" as const,
      src: `/media/web/${scene.file}.jpg`,
      thumb: `/media/web/${scene.file}-thumb.jpg`,
      width: scene.width,
      height: scene.height,
      alt: scene.alt,
    };
  },
);

/**
 * A stable walk through the eight generated stills, so a pile of any length
 * cycles through different scenes rather than repeating the same shot back
 * to back.
 */
export function pickVariedFrame(index: number): MediaRef {
  const frame = VARIED_FRAMES[index % VARIED_FRAMES.length];
  if (!frame) {
    throw new Error("The varied frame set is empty.");
  }
  return { ...frame, id: `${frame.id}-${index}` };
}
