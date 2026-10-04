import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import type { ReactNode } from "react";
import { UploadSessionContext } from "./UploadSessionContext";
import { useUploadResources } from "./useUploadResources";
type Props = { viewer: Viewer; children: ReactNode };
/** Keeps one member's controller and preview queue alive across routes. */
export function UploadSessionProvider({
  viewer,
  children,
}: Readonly<Props>): ReactNode {
  const resources = useUploadResources(viewer.memberId);
  return (
    <UploadSessionContext value={resources}>{children}</UploadSessionContext>
  );
}
