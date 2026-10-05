import type { AnyRoute } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { SetupForm } from "@/surfaces/Setup/SetupForm/SetupForm";

/** Anonymous first-admin form; the root owns its availability decision. */
export const Route = createFileRoute("/setup")({
  component: SetupForm,
}) satisfies Pick<AnyRoute, "id" | "path" | "fullPath">;
