import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { IndexPage } from "@/harness/IndexPage";
import { Rail } from "@/harness/Rail";
import { SurfacePage } from "@/harness/SurfacePage";
import { surfaceById } from "@/surfaces";

/**
 * Routing for the harness.
 *
 * Code-based rather than file-based, and one route for all sixteen surfaces,
 * because every surface is an entry in `src/surfaces/index.ts` and its state
 * is a search parameter. A URL is therefore a complete description of what is
 * on screen, which is what makes a review link worth pasting.
 */
const rootRoute = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      <RailForRoute />
    </>
  );
}

function RailForRoute() {
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { state?: string };
  const surfaceId = (params as { surfaceId?: string }).surfaceId;
  const surface = surfaceId === undefined ? undefined : surfaceById(surfaceId);
  const state =
    surface === undefined
      ? undefined
      : (surface.states.find((candidate) => {
          return candidate.id === search.state;
        }) ?? surface.states[0]);

  return <Rail surface={surface} state={state} />;
}

const indexRoute = createRoute({
  getParentRoute: () => {
    return rootRoute;
  },
  path: "/",
  component: IndexPage,
});

interface SurfaceSearch {
  readonly state?: string;
}

const surfaceRoute = createRoute({
  getParentRoute: () => {
    return rootRoute;
  },
  path: "/s/$surfaceId",
  validateSearch: (search: Record<string, unknown>): SurfaceSearch => {
    return {
      state: typeof search.state === "string" ? search.state : undefined,
    };
  },
  component: SurfaceRoute,
});

function SurfaceRoute() {
  const { surfaceId } = surfaceRoute.useParams();
  const { state } = surfaceRoute.useSearch();
  return <SurfacePage surfaceId={surfaceId} stateId={state} />;
}

const routeTree = rootRoute.addChildren([indexRoute, surfaceRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
