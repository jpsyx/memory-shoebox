import { UploadSurface } from "@/surfaces/Upload/UploadSurface/UploadSurface";
import { idSchema } from "@memory-shoebox/shared";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
/** Optional session address survives reload, settlement and sign-in. */
export const Route = createFileRoute("/_app/upload")({
  validateSearch: (search) => {
    return z.object({ session: idSchema.optional() }).parse(search);
  },
  staticData: { hasOwnBar: true },
  component: UploadPage,
});
function UploadPage() {
  const { session } = Route.useSearch();
  const { viewer } = Route.useRouteContext();
  return <UploadSurface key={viewer.memberId} sessionId={session} />;
}
