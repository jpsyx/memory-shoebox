import { createFileRoute } from "@tanstack/react-router";
import { SetupForm } from "@/surfaces/Setup/SetupForm";

/** Anonymous first-admin form; the root owns its availability decision. */
export const Route = createFileRoute("/setup")({ component: SetupForm });
