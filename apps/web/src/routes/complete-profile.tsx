import {
  createFileRoute,
  redirect as routeRedirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";
import { requireSignedIn } from "@/session/requireSignedIn/requireSignedIn";
import { ProfileCompletion } from "@/surfaces/ProfileCompletion/ProfileCompletion";
import type { ReactNode } from "react";

/** Signed-in name completion, outside the private application shell. */
export const Route = createFileRoute("/complete-profile")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, location, search }) => {
    const signedIn = requireSignedIn({
      me: context.setupMe ?? null,
      attemptedHref: location.href,
    });
    if (context.setupMe?.me.profileComplete) {
      throw routeRedirect({
        href: makeSafeHrefFromRedirect(search.redirect),
        replace: true,
      });
    }
    return signedIn;
  },
  component: CompleteProfileRoute,
});

function CompleteProfileRoute(): ReactNode {
  const { setupMe } = Route.useRouteContext();
  const { redirect } = Route.useSearch();
  const navigate = Route.useNavigate();
  return setupMe ? (
    <ProfileCompletion
      key={setupMe.me.member.memberId}
      account={setupMe}
      redirect={redirect}
      onContinue={(href) => {
        void navigate({ href, replace: true });
      }}
    />
  ) : null;
}
