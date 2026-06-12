import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/**
 * Bindings from wrangler.jsonc, merged into the `Cloudflare.Env` interface
 * that `@cloudflare/workers-types` leaves open for projects to extend.
 * `OAUTH_PROVIDER` is not a real binding — workers-oauth-provider injects it
 * into the env it hands the default/API handlers on every request.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      HYPERDRIVE: Hyperdrive;
      UPLOADS: R2Bucket;
      AI: Ai;
      OAUTH_KV: KVNamespace;
      MCP_OBJECT: DurableObjectNamespace;
      OAUTH_PROVIDER: OAuthHelpers;
    }
  }
}
