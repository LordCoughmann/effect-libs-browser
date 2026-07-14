/**
 * Type augmentation for the Cloudflare Browser Run binding.
 *
 * The `MYBROWSER` binding is configured in `wrangler.test.jsonc` via
 * `"browser": { "binding": "MYBROWSER" }` and is only available in
 * the workerd runtime.
 */

declare module "cloudflare:workers" {
  interface ProvidedEnv {
    MYBROWSER: unknown;
    CF_API_TOKEN: string;
    CF_ACCOUNT_ID: string;
  }
}
