/**
 * Type definitions for workerd test bindings.
 *
 * These bindings are provided by the global setup and injected
 * into the workerd runtime via the vitest config.
 */

declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {
    /** WebSocket URL for Chrome CDP connection */
    CHROME_WS_URL: string;
    /** Base URL for local HTTP test server */
    HTTP_BASE_URL: string;
  }

  export const env: ProvidedEnv;
}
