/**
 * The demonstration media catalog.
 *
 * The photographs and the video are real family files sitting in a gitignored
 * folder, which is what makes the pile read like a real dump of
 * near-identical frames rather than a curated set of hero images. Nothing in
 * here is product data: every caption, name and count elsewhere in
 * `src/data/fixtures.ts` is written demonstration content.
 */

export type MediaKind = "photo" | "video";

export interface MediaRef {
  readonly id: string;
  readonly kind: MediaKind;
  /** The display file. Full size for the viewer. */
  readonly src: string;
  /** The pile file. Often the same, because these are already small. */
  readonly thumb: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  /** Videos only. */
  readonly runtime?: string;
  readonly poster?: string;
  readonly sources?: ReadonlyArray<{ src: string; type: string }>;
}

const NEARLY_IDENTICAL =
  "A moment from the same day, one of many near-identical shots.";

/** The landscape frame the archive opens on. */
export const NEWBORN: MediaRef = {
  id: "m-newborn",
  kind: "photo",
  src: "/media/web/IMG_4620.jpg",
  thumb: "/media/web/IMG_4620.jpg",
  width: 2000,
  height: 1500,
  alt:
    "A father in surgical scrubs holds a newborn beside the baby's mother, who is resting.",
};

/** A second landscape frame from the same morning. */
export const MORNING: MediaRef = {
  id: "m-morning",
  kind: "photo",
  src: "/media/web/IMG_4681.jpg",
  thumb: "/media/web/IMG_4681.jpg",
  width: 2000,
  height: 1500,
  alt: "The same morning in the hospital room, a little later.",
};

/** The one portrait frame at full size. */
export const UPRIGHT: MediaRef = {
  id: "m-upright",
  kind: "photo",
  src: "/media/web/IMG_4688.jpg",
  thumb: "/media/web/IMG_4688.jpg",
  width: 1500,
  height: 2000,
  alt: "An upright frame from the same day.",
};

/** The one video in the demonstration set. */
export const CLIP: MediaRef = {
  id: "m-clip",
  kind: "video",
  src: "/media/web/IMG_9247.mp4",
  thumb: "/media/web/IMG_9247-thumb.jpg",
  width: 640,
  height: 1138,
  alt: "The newborn asleep on his father's chest, twenty-two seconds of it.",
  runtime: "0:22",
  poster: "/media/web/IMG_9247-poster.jpg",
  sources: [
    { src: "/media/web/IMG_9247.webm", type: "video/webm" },
    { src: "/media/web/IMG_9247.mp4", type: "video/mp4" },
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
    src: `/media/dump/burst_${padded}.jpg`,
    thumb: `/media/dump/burst_${padded}.jpg`,
    width: 900,
    height: 1600,
    alt: `Frame ${frameNumber} of the burst. The newborn asleep on his father's chest.`,
  };
}

/** Every frame of the burst, in order. */
export const BURST_FRAMES: ReadonlyArray<MediaRef> = Array.from(
  { length: 45 },
  (_unused, index) => createBurstFrame(index + 1),
);

/**
 * The varied-proportion frames the pile is mostly made of. Their real shapes
 * are recorded here because the pile crops nothing: every print claims the
 * height its own proportions need.
 */
const VARIED_SHAPES: ReadonlyArray<readonly [number, number]> = [
  [800, 732],
  [800, 600],
  [800, 818],
  [800, 428],
  [800, 1280],
  [800, 1068],
  [800, 1314],
  [800, 1066],
  [800, 800],
  [800, 1174],
  [800, 570],
  [800, 1600],
  [800, 830],
  [800, 532],
  [800, 1422],
];

export const VARIED_FRAMES: ReadonlyArray<MediaRef> = VARIED_SHAPES.map(
  ([width, height], index) => {
    const padded = String(index + 1).padStart(2, "0");
    return {
      id: `m-varied-${padded}`,
      kind: "photo" as const,
      src: `/media/dump/v${padded}.jpg`,
      thumb: `/media/dump/v${padded}.jpg`,
      width,
      height,
      alt: NEARLY_IDENTICAL,
    };
  },
);

/**
 * A stable walk through the varied frames, so a pile of any length is built
 * from real proportions without repeating the same three shapes in a row.
 */
export function pickVariedFrame(index: number): MediaRef {
  const frame = VARIED_FRAMES[index % VARIED_FRAMES.length];
  if (!frame) {
    throw new Error("The varied frame set is empty.");
  }
  return { ...frame, id: `${frame.id}-${index}` };
}
