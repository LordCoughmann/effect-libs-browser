/**
 * Workerd-specific environment access.
 *
 * In workerd, env vars are injected via miniflare bindings
 * and accessed via the `cloudflare:workers` module.
 */

import { env } from "cloudflare:workers";

/**
 * Get environment variables from workerd bindings.
 */
export const getEnv = () => ({
  wsUrl: env.CHROME_WS_URL,
  httpUrl: env.HTTP_BASE_URL,
});
