/**
 * The cartoon artwork the prototypes and the seed draw from, as data.
 *
 * Shapes are in a 0..1 unit square and are scaled when the SVG is written, so
 * one scene serves a landscape still, a portrait still and a video frame
 * without being authored three times. `phase` moves the one thing in each
 * scene that moves, which is what makes a forty-five frame burst a loop rather
 * than forty-five files.
 *
 * Nothing here is product data. It is demonstration artwork that replaced the
 * real family photographs the prototypes used to carry.
 */

/** One drawing instruction, in unit coordinates. */
export type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      rotate?: number;
    }
  | { kind: "path"; d: string; fill: string };

/** The eight scenes the archive is drawn from. */
export const CARTOON_SCENES = [
  "cot",
  "bath",
  "highChair",
  "pram",
  "firstSteps",
  "cake",
  "beach",
  "arrival",
] as const;

/** One of the eight scenes. */
export type SceneName = (typeof CARTOON_SCENES)[number];

/** Flat cartoon inks, unrelated to the product's own palette. */
const INK = {
  night: "#2f3a56",
  sky: "#cfe3f2",
  cream: "#fdf6ec",
  skin: "#f6d3b8",
  hair: "#5b4636",
  cheek: "#f0a08c",
  mint: "#a8d8c8",
  rose: "#f2b8c6",
  butter: "#f7dc9a",
  sand: "#efdcbc",
  sea: "#8fc7d8",
  wood: "#c9a27a",
} as const;

/** A number that eases in and out once across a whole phase. */
function _swing(phase: number): number {
  return Math.sin(phase * Math.PI * 2);
}

/**
 * The baby: one head, two cheeks, two eyes, a mouth and a bundled body.
 *
 * `lift` raises an arm, which is the thing that varies between two frames of
 * one burst and between two frames of one clip.
 */
function _baby(options: {
  x: number;
  y: number;
  scale: number;
  lift: number;
}): readonly Shape[] {
  const { x, y, scale: s, lift } = options;
  return [
    {
      kind: "ellipse",
      cx: x,
      cy: y + 0.22 * s,
      rx: 0.17 * s,
      ry: 0.2 * s,
      fill: INK.cream,
    },
    { kind: "circle", cx: x, cy: y, r: 0.15 * s, fill: INK.skin },
    {
      kind: "path",
      d: `M ${x - 0.15 * s} ${y - 0.05 * s} a ${0.15 * s} ${0.15 * s} 0 0 1 ${0.3 * s} 0 z`,
      fill: INK.hair,
    },
    {
      kind: "circle",
      cx: x - 0.09 * s,
      cy: y + 0.05 * s,
      r: 0.03 * s,
      fill: INK.cheek,
    },
    {
      kind: "circle",
      cx: x + 0.09 * s,
      cy: y + 0.05 * s,
      r: 0.03 * s,
      fill: INK.cheek,
    },
    {
      kind: "circle",
      cx: x - 0.055 * s,
      cy: y + 0.005 * s,
      r: 0.018 * s,
      fill: INK.night,
    },
    {
      kind: "circle",
      cx: x + 0.055 * s,
      cy: y + 0.005 * s,
      r: 0.018 * s,
      fill: INK.night,
    },
    {
      kind: "path",
      d: `M ${x - 0.04 * s} ${y + 0.08 * s} q ${0.04 * s} ${0.04 * s} ${0.08 * s} 0`,
      fill: INK.night,
    },
    {
      kind: "ellipse",
      cx: x - 0.19 * s,
      cy: y + 0.2 * s - lift * 0.1 * s,
      rx: 0.05 * s,
      ry: 0.07 * s,
      fill: INK.skin,
    },
    {
      kind: "ellipse",
      cx: x + 0.19 * s,
      cy: y + 0.2 * s + lift * 0.1 * s,
      rx: 0.05 * s,
      ry: 0.07 * s,
      fill: INK.skin,
    },
  ];
}

/** A flat ground band, which every scene stands on. */
function _ground(fill: string): Shape {
  return { kind: "rect", x: 0, y: 0.68, w: 1, h: 0.32, fill };
}

/** A flat sky, which every scene sits against. */
function _sky(fill: string): Shape {
  return { kind: "rect", x: 0, y: 0, w: 1, h: 1, fill };
}

/** What each scene puts around the baby, and where the baby stands in it. */
const SCENE_PROPS: Record<
  SceneName,
  (phase: number) => {
    readonly props: readonly Shape[];
    readonly baby: { x: number; y: number; scale: number };
  }
> = {
  cot: (phase) => {
    return {
      props: [
        _sky(INK.night),
        _ground(INK.wood),
        { kind: "rect", x: 0.12, y: 0.42, w: 0.76, h: 0.34, fill: INK.cream },
        { kind: "circle", cx: 0.82, cy: 0.18, r: 0.07, fill: INK.butter },
        {
          kind: "circle",
          cx: 0.2 + _swing(phase) * 0.01,
          cy: 0.14,
          r: 0.02,
          fill: INK.cream,
        },
      ],
      baby: { x: 0.5, y: 0.5, scale: 0.9 },
    };
  },
  bath: (phase) => {
    return {
      props: [
        _sky(INK.sky),
        _ground(INK.mint),
        {
          kind: "ellipse",
          cx: 0.5,
          cy: 0.72,
          rx: 0.36,
          ry: 0.16,
          fill: INK.cream,
        },
        {
          kind: "circle",
          cx: 0.3,
          cy: 0.5 - _swing(phase) * 0.04,
          r: 0.035,
          fill: INK.cream,
        },
        {
          kind: "circle",
          cx: 0.68,
          cy: 0.44 + _swing(phase) * 0.05,
          r: 0.025,
          fill: INK.cream,
        },
      ],
      baby: { x: 0.5, y: 0.52, scale: 0.85 },
    };
  },
  highChair: (phase) => {
    return {
      props: [
        _sky(INK.butter),
        _ground(INK.wood),
        { kind: "rect", x: 0.3, y: 0.6, w: 0.4, h: 0.1, fill: INK.cream },
        { kind: "circle", cx: 0.5, cy: 0.63, r: 0.05, fill: INK.rose },
        {
          kind: "circle",
          cx: 0.24 + _swing(phase) * 0.02,
          cy: 0.66,
          r: 0.02,
          fill: INK.mint,
        },
      ],
      baby: { x: 0.5, y: 0.38, scale: 0.9 },
    };
  },
  pram: (phase) => {
    return {
      props: [
        _sky(INK.sky),
        _ground(INK.mint),
        {
          kind: "ellipse",
          cx: 0.5,
          cy: 0.55,
          rx: 0.3,
          ry: 0.22,
          fill: INK.night,
        },
        {
          kind: "circle",
          cx: 0.32 + _swing(phase) * 0.01,
          cy: 0.78,
          r: 0.08,
          fill: INK.night,
        },
        {
          kind: "circle",
          cx: 0.68 + _swing(phase) * 0.01,
          cy: 0.78,
          r: 0.08,
          fill: INK.night,
        },
      ],
      baby: { x: 0.5, y: 0.44, scale: 0.8 },
    };
  },
  firstSteps: (phase) => {
    return {
      props: [
        _sky(INK.cream),
        _ground(INK.wood),
        {
          kind: "ellipse",
          cx: 0.5,
          cy: 0.83,
          rx: 0.2,
          ry: 0.035,
          fill: INK.sand,
        },
        { kind: "circle", cx: 0.12, cy: 0.2, r: 0.06, fill: INK.rose },
      ],
      baby: { x: 0.5 + _swing(phase) * 0.06, y: 0.44, scale: 1 },
    };
  },
  cake: (phase) => {
    return {
      props: [
        _sky(INK.rose),
        _ground(INK.wood),
        { kind: "rect", x: 0.34, y: 0.6, w: 0.32, h: 0.14, fill: INK.cream },
        { kind: "rect", x: 0.49, y: 0.5, w: 0.02, h: 0.1, fill: INK.butter },
        {
          kind: "ellipse",
          cx: 0.5 + _swing(phase) * 0.012,
          cy: 0.47,
          rx: 0.016,
          ry: 0.03,
          fill: "#ff9f43",
        },
        {
          kind: "circle",
          cx: 0.16,
          cy: 0.16 + _swing(phase) * 0.02,
          r: 0.018,
          fill: INK.mint,
        },
        {
          kind: "circle",
          cx: 0.86,
          cy: 0.24 - _swing(phase) * 0.02,
          r: 0.018,
          fill: INK.butter,
        },
      ],
      baby: { x: 0.5, y: 0.34, scale: 0.85 },
    };
  },
  beach: (phase) => {
    return {
      props: [
        _sky(INK.sky),
        { kind: "rect", x: 0, y: 0.5, w: 1, h: 0.16, fill: INK.sea },
        _ground(INK.sand),
        { kind: "circle", cx: 0.84, cy: 0.16, r: 0.08, fill: INK.butter },
        {
          kind: "ellipse",
          cx: 0.3,
          cy: 0.62 + _swing(phase) * 0.01,
          rx: 0.12,
          ry: 0.02,
          fill: INK.cream,
        },
      ],
      baby: { x: 0.52, y: 0.46, scale: 0.85 },
    };
  },
  arrival: (phase) => {
    return {
      props: [
        _sky(INK.mint),
        _ground(INK.cream),
        {
          kind: "ellipse",
          cx: 0.5,
          cy: 0.66,
          rx: 0.34,
          ry: 0.14,
          fill: INK.cream,
        },
        {
          kind: "circle",
          cx: 0.18,
          cy: 0.2 + _swing(phase) * 0.015,
          r: 0.05,
          fill: INK.rose,
        },
        { kind: "circle", cx: 0.82, cy: 0.26, r: 0.04, fill: INK.butter },
      ],
      baby: { x: 0.5, y: 0.46, scale: 0.95 },
    };
  },
};

/** Everything one frame of one scene draws, back to front. */
export function getShapesFromScene(options: {
  scene: SceneName;
  /** 0 to 1. Moves the one thing in this scene that moves. */
  phase: number;
}): readonly Shape[] {
  const { props, baby } = SCENE_PROPS[options.scene](options.phase);
  return [
    ...props,
    ..._baby({ ...baby, lift: (_swing(options.phase) + 1) / 2 }),
  ];
}
