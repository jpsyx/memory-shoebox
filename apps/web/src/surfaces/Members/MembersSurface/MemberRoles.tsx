import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import systemClasses from "@/system/system.module.css";
import classes from "@/surfaces/Members/MembersSurface/MemberRoles.module.css";

/** The role ladder's concrete capabilities, kept beside the directory. */
export function MemberRoles(): ReactNode {
  return (
    <Sheet wide label="What the roles mean">
      <SheetHead title="What the roles mean" />
      <dl className={clsx(systemClasses.defs, classes.memberRolesDefinitions)}>
        <dt>Viewer</dt>
        <dd>
          Looks, comments, can ask for a photograph they are tagged in to come
          down, and manages their own devices.
        </dd>
        <dt>Uploader</dt>
        <dd>
          Everything a viewer can, plus putting things up, setting who can see
          them, tagging, milestones, and deleting their own uploads.
        </dd>
        <dt>Admin</dt>
        <dd>
          Everything an uploader can, plus inviting, roles, groups, the instance
          title, deleting anything, signing out anybody's device, and seeing
          every item in the archive without exception.
        </dd>
      </dl>
    </Sheet>
  );
}
