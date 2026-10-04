import { createFileRoute } from "@tanstack/react-router";
import { idSchema } from "@memory-shoebox/shared";
import { z } from "zod";
import { UploadSurface } from "@/surfaces/Upload/UploadSurface/UploadSurface";
const SEARCH_SCHEMA = z.object({ session: idSchema.optional() });
/** Optional session address survives reload, settlement and sign-in. */
export const Route = createFileRoute("/_app/upload")({
  validateSearch: (search) => {
    return SEARCH_SCHEMA.parse(search);
  },
  staticData: { hasOwnBar: true },
  component: UploadPage,
});
function UploadPage() {
  const { session } = Route.useSearch();
  const { viewer } = Route.useRouteContext();
  return <UploadSurface key={viewer.memberId} sessionId={session} />;
}
