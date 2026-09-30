import { describe, expect, it } from "vitest";
import { getShapesFromScene } from "./cartoonScene";
import { makeSvgFromShapes } from "./cartoonSvg";

describe("makeSvgFromShapes", () => {
  it("writes a document at the asked-for pixel size", () => {
    const svg = makeSvgFromShapes({
      shapes: getShapesFromScene({ scene: "cot", phase: 0 }),
      width: 1600,
      height: 1067,
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1600"');
    expect(svg).toContain('height="1067"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("scales unit coordinates by the longest edge, so nothing is squashed", () => {
    const svg = makeSvgFromShapes({
      shapes: [{ kind: "circle", cx: 0.5, cy: 0.5, r: 0.5, fill: "#000000" }],
      width: 200,
      height: 100,
    });
    expect(svg).toContain('cx="100"');
    expect(svg).toContain('cy="50"');
  });

  it("escapes nothing it does not have to, and emits no script", () => {
    const svg = makeSvgFromShapes({
      shapes: getShapesFromScene({ scene: "beach", phase: 0.5 }),
      width: 400,
      height: 400,
    });
    expect(svg).not.toContain("<script");
  });
});
