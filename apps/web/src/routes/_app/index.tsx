import { createFileRoute } from "@tanstack/react-router";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRef } from "react";
import { z } from "zod";
import { takeFirstSignIn } from "@/session/firstSignIn/firstSignIn";
import { Banner } from "@/system/Chrome/Banner";
import { Page } from "@/system/Chrome/Page";
import { ICON_PROPS } from "@/system/icons";
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
  // `takeFirstSignIn` clears as it reads, so it must run once per mount.
  // `StrictMode` double-invokes a `useState` initialiser (`main.tsx` wraps
  // the app in one), and a ref survives that where a second call to an
  // impure initialiser does not: the flag is read on the first render and
  // the same answer is reused on the second.
  const isFirstSignInRef = useRef<boolean | undefined>(undefined);
  isFirstSignInRef.current ??= takeFirstSignIn();
  const isFirstSignIn = isFirstSignInRef.current;

  return (
    <Page wide>
      {isFirstSignIn ? (
        <Banner icon={<IconInfoCircle {...ICON_PROPS} />}>
          <b>Welcome in.</b> Everything already here is yours to look through,
          and nothing is marked new, because none of it arrived since you
          joined. The count that finishes this sentence comes from the timeline,
          which is built in step 4a.
        </Banner>
      ) : null}
      <Lede>The timeline.</Lede>
      <Prose onPanel>
        Surfaces 2, 5 and 6. Built in step 5b, against the timeline step 4a
        delivers.
      </Prose>
    </Page>
  );
}
