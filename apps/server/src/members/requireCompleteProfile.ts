import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/** Require an explicitly completed identity before participating. */
export function requireCompleteProfile(viewer: Readonly<Viewer>): void {
  if (!viewer.profileComplete) {
    throw ApiError.forbidden("profile_required");
  }
}
