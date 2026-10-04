import { describe, expect, it } from "vitest";
import { Route } from "@/routes/_app/index";
import { Route as UploadRoute } from "@/routes/_app/upload";

/**
 * The pile's search parameters, against the router's real parser.
 *
 * `validateSearch` is where a filtered URL becomes a filtered pile, and the
 * router's default parser hands it one value as a bare string and several as
 * an array. A schema that only accepted the array shape rejected the single
 * filter outright, which is the commonest one there is.
 */
function _parse(search: Record<string, unknown>): unknown {
  const validate: unknown = Route.options.validateSearch;
  // The router takes either a function or a schema; this route hands it one.
  if (
    typeof validate === "object" &&
    validate !== null &&
    "parse" in validate &&
    typeof validate.parse === "function"
  ) {
    return validate.parse(search);
  }
  if (typeof validate === "function") {
    return validate(search);
  }
  throw new Error("The pile route has no validateSearch");
}

describe("the pile's filters", () => {
  it("reads one tag, which the router hands over as a bare string", () => {
    expect(_parse({ tag: "hospital" })).toMatchObject({ tag: ["hospital"] });
  });

  it("reads several tags, which arrive as an array already", () => {
    expect(_parse({ tag: ["hospital", "beach"] })).toMatchObject({
      tag: ["hospital", "beach"],
    });
  });

  it("reads one person the same way", () => {
    expect(_parse({ person: "Mateo" })).toMatchObject({ person: ["Mateo"] });
  });

  it("leaves an unfiltered pile unfiltered", () => {
    expect(_parse({})).toMatchObject({});
  });

  it("carries a date range and the filter sheet's own flag", () => {
    expect(
      _parse({ from: "2026-09-01", until: "2026-09-30", find: true }),
    ).toMatchObject({ from: "2026-09-01", until: "2026-09-30", find: true });
  });
});

describe("upload session address", () => {
  it("rejects invalid session search", () => {
    const validate = UploadRoute.options.validateSearch;
    expect(() => {
      if (typeof validate === "function") {
        validate({ session: "bad/id" });
      } else {
        throw new Error("No upload validator");
      }
    }).toThrow();
    expect(typeof validate).toBe("function");
  });
});
