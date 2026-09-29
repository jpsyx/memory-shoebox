import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { meQueryOptions } from "@/api/me/me";
import { requireSignedIn } from "@/session/requireSignedIn/requireSignedIn";
import { ProductBar } from "@/system/ProductBar/ProductBar";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    // `query` rather than the deprecated `ensureQueryData`, which
    // `staleTime: "static"` is the documented replacement for. Spelled out
    // rather than left to the `Infinity` on `meQueryOptions`, whose effect
    // here is coincidentally identical.
    //
    // It buys nothing beyond this one call, and it is worth saying so: the
    // immunity `"static"` gives to a bulk `refetchQueries()` sweep, and to
    // another observer's `refetchOnMount: "always"`, is per observer, and
    // `query()` never registers one. The moment a component mounts
    // `useQuery(meQueryOptions)` it observes with `Infinity` rather than
    // `"static"`, and a sweep reaches the query again.
    const me = await context.queryClient.query({
      ...meQueryOptions,
      staleTime: "static",
    });
    return requireSignedIn({ me, attemptedHref: location.href });
  },
  component: AppShell,
});

/**
 * The signed-in shell: the product bar, then the surface.
 *
 * Every surface except sign-in sits inside this: `<Outlet />` renders
 * whichever route matched. The Shoebox name comes from the account
 * response's settings, and `sign-in.tsx` reads its own from
 * `GET /api/public-settings`, the one route an anonymous caller may reach.
 */
function AppShell() {
  const { viewer, settings } = Route.useRouteContext();
  const matches = useMatches();

  // An item page replaces the bar rather than adding one under it.
  //
  // `DESIGN.md` § Navigation: "Item pages replace the name with a back
  // link." Replace, not stack. The shell cannot know which surfaces those
  // are without asking, so each one says so and the shell stands aside.
  const hasOwnBar = matches.some((match) => {
    return match.staticData.hasOwnBar === true;
  });

  return (
    <>
      {hasOwnBar ? null : (
        <ProductBar
          shoeboxName={settings.shoeboxName}
          memberName={viewer.displayName}
          role={viewer.role}
        />
      )}
      <Outlet />
    </>
  );
}

/** What a route may tell the shell about itself. */
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Set where the surface draws its own top bar, such as an item page. */
    readonly hasOwnBar?: boolean;
  }
}
