import type { Shape } from "./cartoonScene";

/**
 * Turns unit-square shapes into an SVG document at a pixel size.
 *
 * Each axis is scaled independently so a scene fills whatever frame it is
 * asked for, and the circle radius takes the mean of the two, which keeps a
 * face round enough in a 3:2 box without needing a second set of coordinates.
 */
export function makeSvgFromShapes(options: {
  shapes: readonly Shape[];
  width: number;
  height: number;
}): string {
  const { shapes, width, height } = options;
  const x = (value: number) => {
    return Number((value * width).toFixed(2));
  };
  const y = (value: number) => {
    return Number((value * height).toFixed(2));
  };
  const r = (value: number) => {
    return Number((value * ((width + height) / 2)).toFixed(2));
  };

  const body = shapes
    .map((shape) => {
      switch (shape.kind) {
        case "rect":
          return `<rect x="${x(shape.x)}" y="${y(shape.y)}" width="${x(shape.w)}" height="${y(shape.h)}" fill="${shape.fill}"/>`;
        case "circle":
          return `<circle cx="${x(shape.cx)}" cy="${y(shape.cy)}" r="${r(shape.r)}" fill="${shape.fill}"/>`;
        case "ellipse":
          return `<ellipse cx="${x(shape.cx)}" cy="${y(shape.cy)}" rx="${x(shape.rx)}" ry="${y(shape.ry)}" fill="${shape.fill}"/>`;
        case "path":
          return `<path d="${_scalePath(shape.d, x, y)}" fill="${shape.fill}"/>`;
      }
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
}

/**
 * Which axis scales each numeric parameter of one path command, in the order
 * the parameter appears, for the commands the cartoon scenes use.
 *
 * "none" marks a parameter that is not a coordinate at all: an arc's
 * rotation angle and its two 0/1 flags. Scaling those by a pixel size would
 * turn a flag into an invalid, multi-digit token, which is the bug this
 * table exists to avoid. A command absent from this table (the scenes only
 * emit `M`, `a` and `q`, plus the parameterless `z`) falls back to
 * alternating x and y, which is correct for every other standard command
 * because they are all sequences of coordinate pairs.
 */
const _PATH_COMMAND_AXES: Readonly<
  Partial<Record<string, ReadonlyArray<"x" | "y" | "none">>>
> = {
  A: ["x", "y", "none", "none", "none", "x", "y"],
  H: ["x"],
  V: ["y"],
  Z: [],
};

/**
 * Scales a path whose numbers are unit-square fractions, one command at a
 * time, rather than by blindly alternating x and y across the whole string.
 *
 * A plain alternation is exact for `M`, `L`, `C`, `Q` and the like, because
 * every parameter of those commands is one half of an (x, y) pair. It is
 * wrong for `A` (arc): three of its seven parameters, the rotation and the
 * two flags, are not coordinates, so scaling them shifts the alternation out
 * of phase and corrupts every coordinate after it. This walks the path
 * command by command, so each parameter is scaled by the axis it actually
 * represents, or left untouched when it represents none.
 */
function _scalePath(
  d: string,
  x: (value: number) => number,
  y: (value: number) => number,
): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  let axes: ReadonlyArray<"x" | "y" | "none"> = ["x", "y"];
  let axisIndex = 0;

  const scaledTokens = tokens.map((token) => {
    if (/[A-Za-z]/.test(token)) {
      axes = _PATH_COMMAND_AXES[token.toUpperCase()] ?? ["x", "y"];
      axisIndex = 0;
      return token;
    }
    const axis = axes.length > 0 ? axes[axisIndex % axes.length] : "none";
    axisIndex += 1;
    if (axis === "x") {
      return String(x(Number(token)));
    }
    if (axis === "y") {
      return String(y(Number(token)));
    }
    return token;
  });

  return scaledTokens.join(" ");
}
