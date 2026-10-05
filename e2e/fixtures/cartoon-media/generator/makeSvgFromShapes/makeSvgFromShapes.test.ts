import { describe, expect, it } from "vitest";
import { getShapesFromScene } from "../getShapesFromScene/getShapesFromScene.ts";
import { makeSvgFromShapes } from "./makeSvgFromShapes.ts";

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

  it("scales each axis by its own edge, so a scene fills the frame it is given", () => {
    const svg = makeSvgFromShapes({
      shapes: [{ kind: "circle", cx: 0.5, cy: 0.5, r: 0.5, fill: "#000000" }],
      width: 200,
      height: 100,
    });
    expect(svg).toContain('cx="100"');
    expect(svg).toContain('cy="50"');
  });

  it("scales an arc's radii and offset but never its flags", () => {
    // Arc flags and rotation stay unchanged while radii and offsets scale.
    const svg = makeSvgFromShapes({
      shapes: [
        { kind: "path", d: "M 0 0 a 0.1 0.1 0 0 1 0.2 0 z", fill: "#000000" },
      ],
      width: 200,
      height: 100,
    });
    expect(svg).toContain('d="M 0 0 a 20 10 0 0 1 40 0 z"');
  });

  it("emits shape elements and nothing else, whatever the scene holds", () => {
    // The generator interpolates its shapes into the string unescaped,
    // because every value in one is an authored constant rather than
    // anything typed in. What is worth asserting, then, is not escaping it
    // does not do: it is that nothing but the four shape elements and the
    // document itself ever comes out, which is what makes the unescaped
    // interpolation safe in the first place.
    const svg = makeSvgFromShapes({
      shapes: getShapesFromScene({ scene: "beach", phase: 0.5 }),
      width: 400,
      height: 400,
    });
    const elements = [...svg.matchAll(/<([A-Za-z]+)/g)].map((match) => {
      return match[1];
    });
    expect(elements.length).toBeGreaterThan(1);
    expect(
      elements.filter((element) => {
        return !(["svg", "rect", "circle", "ellipse", "path"] as const).some(
          (allowedElement) => {
            return allowedElement === element;
          },
        );
      }),
    ).toEqual([]);
  });
});
