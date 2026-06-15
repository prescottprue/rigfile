import { createFileRoute } from "@tanstack/react-router";

import { useAppSession } from "~/auth/session.server";
import { buildAuthUrl, isGoogleDriveConfigured } from "~/google/oauth.server";
import { createState } from "~/google/state.server";

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/**
 * Kick off the Google Drive connect flow: bounce the signed-in user to
 * Google's consent screen with a signed `state` and a redirect URI derived
 * from the current origin (so dev and prod each work without configuration).
 */
export const Route = createFileRoute("/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await useAppSession();
        const userId = session.data.userId;
        if (!userId) {
          return redirect(
            `/login?redirectTo=${encodeURIComponent("/profile")}`,
          );
        }
        if (!isGoogleDriveConfigured()) {
          return redirect("/profile?drive=unconfigured");
        }

        const url = new URL(request.url);
        const redirectUri = `${url.origin}/auth/google/callback`;
        const state = await createState(userId);
        return redirect(buildAuthUrl({ redirectUri, state }));
      },
    },
  },
});
