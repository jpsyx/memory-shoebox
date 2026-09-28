import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Page } from "@/system/Chrome/Page";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

/**
 * One value or many, both as an array.
 *
 * The router's default search parser reads `?tag=a&tag=b` as an array and
 * `?tag=a` as a bare string, so a schema demanding an array rejects the
 * single-filter case outright: the match lands in error and `beforeLoad`
 * never runs. Somebody pressing one tag is the commonest filter there is, and
 * a hand-typed or shared `?tag=hospital` has to work, because in this product
 * a URL is an address.
 *
 * A union rather than `z.preprocess`, because preprocess takes `unknown` in
 * and that `unknown` is what the router reads to type a `Link`'s `search`
 * prop: every caller would have had to name `tag` and `person` even when
 * setting neither.
 */
function _oneOrMany() {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      return value === undefined || Array.isArray(value) ? value : [value];
    });
}

const searchSchema = z.object({
  tag: _oneOrMany(),
  person: _oneOrMany(),
  from: z.string().optional(),
  until: z.string().optional(),
  /** Whether the filter sheet is open. The "Find" button sets it. */
  find: z.boolean().optional(),
});

export const Route = createFileRoute("/_app/")({
  validateSearch: searchSchema,
  component: TimelinePage,
});

/**
 * The pile, filtered by whatever search parameters the URL carries.
 *
 * A filtered pile is the pile with search parameters on it, not a different
 * surface: "the result is the pile again: same spine, same prints, same
 * stacks" (`design-spec.md` § User flows). Surfaces 2, 5 and 6 are all here.
 */
function TimelinePage() {
  return (
    <Page wide>
      <Lede>The timeline.</Lede>
      <Prose onPanel>
        Surfaces 2, 5 and 6. Built in step 5b, against the timeline step 4a
        delivers.
      </Prose>
    </Page>
  );
}
