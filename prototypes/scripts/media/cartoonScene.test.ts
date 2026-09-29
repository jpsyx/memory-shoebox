import { describe, expect, it } from "vitest";
import {
  CARTOON_SCENES,
  getShapesFromScene,
  type SceneName,
} from "./cartoonScene.ts";

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

  it("moves something when the phase moves, so a burst is not 45 copies", () => {
    const early = getShapesFromScene({ scene: "cake", phase: 0 });
    const late = getShapesFromScene({ scene: "cake", phase: 0.9 });
    expect(late).not.toEqual(early);
  });

  it("keeps every shape inside the unit canvas", () => {
    const scene: SceneName = "beach";
    for (const shape of getShapesFromScene({ scene, phase: 0.5 })) {
      if (shape.kind === "circle") {
        expect(shape.cx - shape.r).toBeGreaterThanOrEqual(-0.2);
        expect(shape.cx + shape.r).toBeLessThanOrEqual(1.2);
      }
    }
  });
});
