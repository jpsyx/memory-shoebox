import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import {
  makeQueryFromSelection,
  type TimelineSelection,
} from "@/api/timeline/selection/selection";
import {
  filterFacetsResponseSchema,
  peopleResponseSchema,
  tagsResponseSchema,
  type FilterFacetsResponse,
  type PeopleResponse,
  type TagsResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
/** The exact path the facets row is asked for at. */
export function makeFacetsPathFromSelection(
  selection: Readonly<TimelineSelection>,
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
export function makeFilterFacetsQueryOptionsFromSelection({
  selection,
  memberId,
}: Readonly<{
  selection: Readonly<TimelineSelection>;
  memberId?: string;
}>): ReturnType<
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
      ...(memberId === undefined ? [] : [memberId]),
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

/**
 * The tag vocabulary, for the free-text field's suggestions.
 *
 * One of the two vocabularies the type-ahead draws from. A tag exists
 * independently of any one selection, which is what keeps this apart from the
 * day stream, and why nothing here is narrowed by one.
 */
export function makeTagsQueryOptionsFromSearchScope({
  q = "",
  memberId,
}: Readonly<{ q: string | undefined; memberId?: string }>): ReturnType<
  typeof queryOptions<TagsResponse, Error, TagsResponse, string[]>
> {
  return queryOptions({
    queryKey: ["tags", ...(memberId === undefined ? [] : [memberId]), q],
    queryFn: (): Promise<TagsResponse> => {
      return apiFetch({
        path: makeTagsPathFromQuery(q),
        schema: tagsResponseSchema,
      });
    },
  });
}

/**
 * The people directory, and the filter surface's person vocabulary.
 *
 * The other of the two, and a person exists independently of any one
 * selection exactly as a tag does.
 */
export function makePeopleQueryOptionsFromSearchScope({
  q = "",
  memberId,
}: Readonly<{ q: string | undefined; memberId?: string }>): ReturnType<
  typeof queryOptions<PeopleResponse, Error, PeopleResponse, string[]>
> {
  return queryOptions({
    queryKey: ["people", ...(memberId === undefined ? [] : [memberId]), q],
    queryFn: (): Promise<PeopleResponse> => {
      return apiFetch({
        path: makePeoplePathFromQuery(q),
        schema: peopleResponseSchema,
      });
    },
  });
}
