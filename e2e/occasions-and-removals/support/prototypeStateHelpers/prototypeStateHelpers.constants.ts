/** Required prototype state inventory, kept separate from real-API cases. */
export const VISUAL_STATES = {
  removal: ["ask", "already", "uploader", "admin", "declined"],
  "removal-requests": ["open", "deleting", "declining", "settled", "none"],
  milestones: [
    "list",
    "create",
    "create-span",
    "created",
    "fix",
    "edit",
    "attach",
    "empty",
    "delete",
  ],
} as const;
/** Shared deterministic ID for controlled visual targets. */
export const VISUAL_ITEM_ID = "018f0000-0000-7000-8000-00000000f001";
/** Shared deterministic occasion identity. */
export const VISUAL_MILESTONE_ID = "018f0000-0000-7000-8000-000000008001";
