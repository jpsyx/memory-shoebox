import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireViewer, viewerQueryOptions } from "@/session/viewer";
import { TopBar } from "@/system/Chrome";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const viewer =
      await context.queryClient.ensureQueryData(viewerQueryOptions);
    return { viewer: requireViewer(viewer, location.href) };
  },
  component: AppShell,
});

/**
 * The signed-in shell: the top bar, then the surface.
 *
 * Every surface except sign-in sits inside this, so a later step fills the
 * middle and touches nothing else. The bar's counts are placeholders in this
 * step: nothing fetches until step 4b.
 */
function AppShell() {
  const { viewer } = Route.useRouteContext();

  return (
    <>
      <TopBar
        title="My Shoebox"
        detail={`Signed in as ${viewer.displayName}`}
      />
      <Outlet />
    </>
  );
}
