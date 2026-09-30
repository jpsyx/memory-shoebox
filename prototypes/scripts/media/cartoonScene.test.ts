import { describe, expect, it } from "vitest";
import { CARTOON_SCENES, getShapesFromScene, type Shape } from "./cartoonScene";

/**
 * One shape's bounding box, so the bounds test covers the ellipses and rects
 * rather than only the circles.
 *
 * The arms and the bundle are ellipses and they are the parts that move, so a
 * check that skipped them would be checking only the things that cannot drift.
 * A `path` is left out: its `d` is a string and parsing it here would be a
 * second renderer.
 */
function boundsOfShape(shape: Shape): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  switch (shape.kind) {
    case "rect":
      return {
        left: shape.x,
        right: shape.x + shape.w,
        top: shape.y,
        bottom: shape.y + shape.h,
      };
    case "circle":
      return {
        left: shape.cx - shape.r,
        right: shape.cx + shape.r,
        top: shape.cy - shape.r,
        bottom: shape.cy + shape.r,
      };
    case "ellipse":
      return {
        left: shape.cx - shape.rx,
        right: shape.cx + shape.rx,
        top: shape.cy - shape.ry,
        bottom: shape.cy + shape.ry,
      };
    case "path":
      return { left: 0, right: 1, top: 0, bottom: 1 };
  }
}

describe("getShapesFromScene", () => {
  it("draws every named scene", () => {
    for (const scene of CARTOON_SCENES) {
      expect(getShapesFromScene({ scene, phase: 0 }).length).toBeGreaterThan(4);
    }
  });

  it("is deterministic: the same scene and phase give the same shapes", () => {
    const once = getShapesFromScene({ scene: "cake", phase: 0.25 });
    const twice = getShapesFromScene({ scene: "cake", phase: 0.25 });
    expect(twice).toEqual(once);
  });

  it("moves something in every scene when the phase moves", () => {
    // Every scene, not one: a scene that ignored `phase` would turn the
    // forty-five frame burst into forty-five identical files, which is the
    // failure this whole module exists to prevent.
    for (const scene of CARTOON_SCENES) {
      const early = getShapesFromScene({ scene, phase: 0 });
      const late = getShapesFromScene({ scene, phase: 0.9 });
      expect(late, scene).not.toEqual(early);
    }
  });

  it("loops cleanly, so a repeating clip has no seam", () => {
    for (const scene of CARTOON_SCENES) {
      expect(getShapesFromScene({ scene, phase: 1 }), scene).toEqual(
        getShapesFromScene({ scene, phase: 0 }),
      );
    }
  });

  it("keeps every shape inside the unit canvas, at the phases that move", () => {
    // 0.25 and 0.75 are the extremes of `_swing`. Sampling 0.5 instead would
    // test the artwork at rest, which is the one phase where every animated
    // offset evaluates to zero and nothing can be out of place.
    for (const scene of CARTOON_SCENES) {
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        for (const bounds of getShapesFromScene({ scene, phase }).map(
          boundsOfShape,
        )) {
          expect(bounds.left, `${scene} at ${phase}`).toBeGreaterThanOrEqual(
            -0.02,
          );
          expect(bounds.right, `${scene} at ${phase}`).toBeLessThanOrEqual(
            1.02,
          );
          expect(bounds.top, `${scene} at ${phase}`).toBeGreaterThanOrEqual(
            -0.02,
          );
          expect(bounds.bottom, `${scene} at ${phase}`).toBeLessThanOrEqual(
            1.02,
          );
        }
      }
    }
  });
});
