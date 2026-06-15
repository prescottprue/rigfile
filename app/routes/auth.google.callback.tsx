import { createFileRoute } from "@tanstack/react-router";

import { useAppSession } from "~/auth/session.server";
import { exchangeCode } from "~/google/oauth.server";
import { verifyState } from "~/google/state.server";
import { saveConnectionFromTokens } from "~/models/google-drive.server";

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/**
 * Google redirects back here after consent. We verify the signed `state`
 * against the current session, exchange the code for tokens, and persist the
 * (encrypted) connection. All outcomes land back on /profile with a `drive`
 * status the UI turns into a banner.
 */
export const Route = createFileRoute("/auth/google/callback")({
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

        const url = new URL(request.url);
        if (url.searchParams.get("error")) {
          return redirect("/profile?drive=denied");
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !(await verifyState(state, userId))) {
          return redirect("/profile?drive=error");
        }

        try {
          const redirectUri = `${url.origin}/auth/google/callback`;
          const tokens = await exchangeCode({ code, redirectUri });
          await saveConnectionFromTokens({ userId, tokens });
          return redirect("/profile?drive=connected");
        } catch {
          return redirect("/profile?drive=error");
        }
      },
    },
  },
});
