import { accountSurface } from "@/surfaces/Account";
import { emailsSurface } from "@/surfaces/Emails";
import { emptySurface } from "@/surfaces/EmptyArchive";
import { filterSurface } from "@/surfaces/FilterSearch";
import { groupsSurface } from "@/surfaces/Groups";
import { membersSurface } from "@/surfaces/Members";
import { milestonesSurface } from "@/surfaces/Milestones";
import { peopleSurface } from "@/surfaces/PeopleDirectory";
import { photoSurface } from "@/surfaces/Photo";
import { presenceSurface } from "@/surfaces/Presence";
import { removalRequestsSurface } from "@/surfaces/RemovalRequests";
import { removalSurface } from "@/surfaces/RequestRemoval";
import { settingsSurface } from "@/surfaces/Settings";
import { signInSurface } from "@/surfaces/SignIn";
import { timelineSurface } from "@/surfaces/Timeline";
import { uploadSurface } from "@/surfaces/Upload";
import { videoSurface } from "@/surfaces/Video";
import type { Surface } from "@/surfaces/registry";

/** Every surface in `docs/spec.md`, in the order the spec lists them. */
export const SURFACES: readonly Surface[] = [
  signInSurface,
  timelineSurface,
  photoSurface,
  videoSurface,
  emptySurface,
  filterSurface,
  peopleSurface,
  uploadSurface,
  accountSurface,
  removalSurface,
  settingsSurface,
  membersSurface,
  groupsSurface,
  milestonesSurface,
  removalRequestsSurface,
  emailsSurface,
  presenceSurface,
];

export function surfaceById(id: string): Surface | undefined {
  return SURFACES.find((surface) => {
    return surface.id === id;
  });
}
