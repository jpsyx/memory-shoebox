import { createFileRoute } from "@tanstack/react-router";
import { SettingsSurface } from "@/surfaces/Settings/SettingsSurface/SettingsSurface";
/** Administrative settings replace the ordinary bar with the account back link. */
export const Route = createFileRoute("/_app/settings")({
  staticData: { hasOwnBar: true },
  component: SettingsSurface,
});
