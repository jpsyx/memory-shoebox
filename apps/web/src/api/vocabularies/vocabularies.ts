import {
  filterFacetsResponseSchema,
  peopleResponseSchema,
  tagsResponseSchema,
  type FilterFacetsResponse,
  type PeopleResponse,
  type TagsResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch, makePathFromSearchParams } from "@/api/client/client";
import {
  makeQueryFromSelection,
  type TimelineSelection,
} from "@/api/timeline/selection";

/**
 * The two vocabularies the filter surface and the people directory draw from.
 *
 * The facets row is the chips and what each is worth; `/api/tags` and
 * `/api/people` are the type-ahead's vocabulary. A tag or a person exists
 * independently of any one selection, which is what keeps these apart from the
 * day stream.
 */

/** The exact path the facets row is asked for at. */
export function makeFacetsPathFromSelection(
  selection: TimelineSelection,
): string {
  return makePathFromSearchParams({
    basePath: "/filters/facets",
    searchParams: makeQueryFromSelection(selection),
  });
}

/** The exact path the tag vocabulary is asked for at. */
export function makeTagsPathFromQuery(q: string | undefined): string {
  const query = new URLSearchParams();
  if (q !== undefined && q !== "") {
    query.set("q", q);
  }
  return makePathFromSearchParams({ basePath: "/tags", searchParams: query });
}

/** The exact path the people directory is asked for at. */
export function makePeoplePathFromQuery(q: string | undefined): string {
  const query = new URLSearchParams();
  if (q !== undefined && q !== "") {
    query.set("q", q);
  }
  return makePathFromSearchParams({
    basePath: "/people",
    searchParams: query,
  });
}

/**
 * Every chip and what adding it to the selection would leave.
 *
 * The counts narrow rather than standing alone, a zero chip stays on the row
 * and goes quiet, and the row's order never changes with the selection. All
 * three are the server's job; the client draws what it is given.
 */
export function filterFacetsQueryOptions(
  selection: TimelineSelection,
): ReturnType<
  typeof queryOptions<
    FilterFacetsResponse,
    Error,
    FilterFacetsResponse,
    string[]
  >
> {
  return queryOptions({
    queryKey: [
      "filters",
      "facets",
      makeQueryFromSelection(selection).toString(),
    ],
    queryFn: (): Promise<FilterFacetsResponse> => {
      return apiFetch({
        path: makeFacetsPathFromSelection(selection),
        schema: filterFacetsResponseSchema,
      });
    },
  });
}

/** The tag vocabulary, for the free-text field's suggestions. */
export function tagsQueryOptions(
  q: string | undefined,
): ReturnType<
  typeof queryOptions<TagsResponse, Error, TagsResponse, string[]>
> {
  return queryOptions({
    queryKey: ["tags", q ?? ""],
    queryFn: (): Promise<TagsResponse> => {
      return apiFetch({
        path: makeTagsPathFromQuery(q),
        schema: tagsResponseSchema,
      });
    },
  });
}

/** The people directory, and the filter surface's person vocabulary. */
export function peopleQueryOptions(
  q: string | undefined,
): ReturnType<
  typeof queryOptions<PeopleResponse, Error, PeopleResponse, string[]>
> {
  return queryOptions({
    queryKey: ["people", q ?? ""],
    queryFn: (): Promise<PeopleResponse> => {
      return apiFetch({
        path: makePeoplePathFromQuery(q),
        schema: peopleResponseSchema,
      });
    },
  });
}
