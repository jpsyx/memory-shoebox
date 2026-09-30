import { describe, expect, it } from "vitest";
import {
  makeFacetsPathFromSelection,
  makePeoplePathFromQuery,
  makeTagsPathFromQuery,
} from "@/api/vocabularies/vocabularies";

const EMPTY = { tags: [], people: [], from: undefined, until: undefined };

describe("makeFacetsPathFromSelection", () => {
  it("asks for the unfiltered row when nothing is chosen", () => {
    expect(makeFacetsPathFromSelection(EMPTY)).toBe("/filters/facets");
  });

  it("carries the selection, so the counts narrow", () => {
    expect(
      makeFacetsPathFromSelection({ ...EMPTY, tags: ["t"], people: ["p"] }),
    ).toBe("/filters/facets?tags=t&people=p");
  });
});

describe("makeTagsPathFromQuery", () => {
  it("asks for the whole vocabulary with no search", () => {
    expect(makeTagsPathFromQuery(undefined)).toBe("/tags");
    expect(makeTagsPathFromQuery("")).toBe("/tags");
  });

  it("escapes what somebody typed", () => {
    expect(makeTagsPathFromQuery("first steps")).toBe("/tags?q=first+steps");
    expect(makeTagsPathFromQuery("a&b")).toBe("/tags?q=a%26b");
  });
});

describe("makePeoplePathFromQuery", () => {
  it("narrows the directory by name", () => {
    expect(makePeoplePathFromQuery("Sofía")).toBe("/people?q=Sof%C3%ADa");
    expect(makePeoplePathFromQuery(undefined)).toBe("/people");
  });
});
