import type { Page } from "@playwright/test";
import type { AcceptanceCatalog } from "../support/createAcceptanceCatalog.ts";
/** One production surface and the state whose evidence is being captured. */
export type AdminVisualCase = {
  page: Page;
  catalog: AcceptanceCatalog;
  surface: string;
  state: string;
  directory: string;
};
/** A single viewport and OS scheme within a surface's evidence matrix. */
export type AdminVisualCapture = AdminVisualCase & {
  width: number;
  scheme: "light" | "dark";
};
