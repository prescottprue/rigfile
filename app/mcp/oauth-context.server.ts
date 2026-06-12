import { AsyncLocalStorage } from "node:async_hooks";

import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/**
 * workers-oauth-provider injects its helpers as `env.OAUTH_PROVIDER` on the
 * env it passes to the default handler — it is per-request, not a real
 * binding, so the global `cloudflare:workers` env never sees it. server.ts
 * stashes it here so the /authorize route (which runs deep inside the
 * TanStack Start handler, where the worker env isn't threaded through) can
 * reach parseAuthRequest/completeAuthorization.
 */
const storage = new AsyncLocalStorage<OAuthHelpers>();

export function runWithOAuthHelpers<T>(
  helpers: OAuthHelpers,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(helpers, fn);
}

export function getOAuthHelpers(): OAuthHelpers {
  const helpers = storage.getStore();
  if (!helpers) {
    throw new Error(
      "OAuth helpers unavailable — /authorize only works behind the OAuthProvider worker entry",
    );
  }
  return helpers;
}
