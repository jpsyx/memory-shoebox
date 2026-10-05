import {
  makeFilterFacetsQueryOptionsFromSelection,
  makeFacetsPathFromSelection,
  makePeoplePathFromQuery,
  makeTagsPathFromQuery,
  makePeopleQueryOptionsFromSearchScope,
  makeTagsQueryOptionsFromSearchScope,
} from "@/api/vocabularies/vocabularies";
import { describe, expect, it } from "vitest";
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

describe("optional picker member identity", () => {
  it("separates vocabulary and facets without changing ordinary keys", () => {
    const selection = {
      tags: [],
      people: [],
      from: undefined,
      until: undefined,
    };
    expect(makeTagsQueryOptionsFromSearchScope({ q: "Home" }).queryKey).toEqual(
      ["tags", "Home"],
    );
    expect(
      makePeopleQueryOptionsFromSearchScope({ q: "Home" }).queryKey,
    ).toEqual(["people", "Home"]);
    expect(
      makeTagsQueryOptionsFromSearchScope({ q: "Home", memberId: "one" })
        .queryKey,
    ).not.toEqual(
      makeTagsQueryOptionsFromSearchScope({ q: "Home", memberId: "two" })
        .queryKey,
    );
    expect(
      makePeopleQueryOptionsFromSearchScope({ q: "Home", memberId: "one" })
        .queryKey,
    ).not.toEqual(
      makePeopleQueryOptionsFromSearchScope({ q: "Home", memberId: "two" })
        .queryKey,
    );
    expect(
      makeFilterFacetsQueryOptionsFromSelection({ selection, memberId: "one" })
        .queryKey,
    ).not.toEqual(
      makeFilterFacetsQueryOptionsFromSelection({ selection, memberId: "two" })
        .queryKey,
    );
  });
});
