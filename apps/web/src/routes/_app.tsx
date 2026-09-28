import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireViewer, viewerQueryOptions } from "@/session/viewer";
import { ProductBar } from "@/system/ProductBar";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    /*
     * `query` rather than the deprecated `ensureQueryData`, with the viewer
     * pinned static: the guard runs on every navigation and must not refetch
     * who is looking on each one.
     */
    const viewer = await context.queryClient.query({
      ...viewerQueryOptions,
      staleTime: "static",
    });
    return { viewer: requireViewer(viewer, location.href) };
  },
  component: AppShell,
});

/**
 * The signed-in shell: the product bar, then the surface.
 *
 * Every surface except sign-in sits inside this, so a later step fills the
 * middle and touches nothing else. The Shoebox name is hardcoded here and in
 * `sign-in.tsx`, the only two places; step 4b wires both to
 * `GET /api/public-settings`, the one route an anonymous caller may reach.
 */
function AppShell() {
  const { viewer } = Route.useRouteContext();

  return (
    <>
      <ProductBar
        shoeboxName="My Shoebox"
        memberName={viewer.displayName}
        role={viewer.role}
        detail="The counts arrive with the timeline, in step 5b"
      />
      <Outlet />
    </>
  );
}
