import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createId } from "../src/db/ids.ts";

/**
 * The frozen DTOs validate every id with `z.uuid()`, and every id this product
 * mints is a UUIDv7 from `createId`. Those are two libraries with separate
 * release cycles agreeing about a spec, which is the kind of agreement that
 * breaks silently.
 *
 * If it ever stops holding, every API response carrying an id fails to parse
 * in the browser while every test using a hand-written fixture keeps passing,
 * so the failure would surface in production and nowhere else. This is the
 * standing check that the two still agree.
 */
describe("ids mint in a form the frozen DTOs accept", () => {
  it("parses every generated id as a uuid", () => {
    const schema = z.uuid();

    for (let index = 0; index < 1_000; index += 1) {
      const id = createId();
      expect(schema.safeParse(id).success, `z.uuid() rejected ${id}`).toBe(
        true,
      );
    }
  });
});
