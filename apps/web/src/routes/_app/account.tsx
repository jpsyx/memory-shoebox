import { createFileRoute } from "@tanstack/react-router";
import { AccountSurface } from "@/surfaces/Account/AccountSurface/AccountSurface";

export const Route = createFileRoute("/_app/account")({
  // The surface draws its own top bar, with a back link where the Shoebox
  // name would be, and `_app.tsx` stands aside for exactly that.
  staticData: { hasOwnBar: true },
  component: AccountSurface,
});
