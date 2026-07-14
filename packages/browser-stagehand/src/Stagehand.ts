/**
 * Defines the `Stagehand` service, which drives a browser with natural-language
 * actions and structured extraction backed by an LLM.
 *
 * See the {@link Stagehand} class below for the consumer-facing documentation
 * (mental model, common tasks, example, gotchas).
 */

/**
 * Polyfill for AsyncLocalStorage.enterWith() - must be imported before Stagehand
 * https://github.com/browserbase/stagehand/issues/2055
 */
import "./polyfills/asyncLocalStorage.js";
import type { V3, V3Options } from "@browserbasehq/stagehand";
import type { Scope } from "effect";

import type {
  BrowserProviderError,
  BrowserProviderService,
  BrowserProviderSession,
  BrowserProviderSessionBase,
} from "@effect-libs/browser";

import type {
  StagehandService,
  StagehandSessionScope,
  StagehandConnectionScope,
} from "./StagehandTypes.js";

import { Context, Effect, Layer, Option, Redacted, type Config } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import {
  StagehandError,
  ConnectionError as ConnectionReason,
  OperationError as OperationReason,
} from "./StagehandError.js";

// ── Config Service ────────────────────────────────────────────────────────────

/**
 * Configuration for the LLM provider.
 *
 * @category models
 * @since 0.1.0
 */
export interface StagehandConfigService {
  /** Model name with provider prefix (e.g., "openai/gpt-4o") */
  readonly model: string;
  /** API key for the LLM provider */
  readonly apiKey: string;
  /** Optional base URL for custom LLM endpoints (e.g., Azure OpenAI, self-hosted) */
  readonly baseURL?: string;
}

/**
 * Configuration options for Stagehand.layerConfig.
 *
 * @category models
 * @since 0.1.0
 */
export interface StagehandConfigOptions {
  readonly model: Config.Config<string>;
  readonly apiKey: Config.Config<Redacted.Redacted<string>>;
  readonly baseURL?: Config.Config<string>;
}

/**
 * Stagehand configuration service.
 *
 * @category services
 * @since 0.1.0
 */
export class StagehandConfig extends Context.Service<StagehandConfig, StagehandConfigService>()(
  "effect-libs/browser/StagehandConfig",
) {
  static readonly layer = (config: StagehandConfigService): Layer.Layer<StagehandConfig> =>
    Layer.succeed(this, config);
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Extract CDP URL from the new source format: { url } | { session }
 */
const resolveConnectionSource = (
  source: { readonly url: string } | { readonly session: BrowserProviderSession },
): string => ("url" in source ? source.url : Redacted.value(source.session.cdpUrl));

const wrapError =
  (module: string, method: string) =>
  (cause: unknown): StagehandError =>
    new StagehandError({
      module,
      method,
      reason: new OperationReason({
        action: method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Constructs a `StagehandService` that builds `V3` instances from
 * `StagehandConfig` and binds their lifecycle to an ambient `Scope`.
 */
const make = Effect.gen(function* () {
  const config = yield* StagehandConfig;

  /**
   * Create a Stagehand instance from V3Options.
   */
  const createInstance = (options: V3Options): Effect.Effect<V3, StagehandError> =>
    Effect.gen(function* () {
      const { V3 } = yield* Effect.tryPromise({
        try: () => import("@browserbasehq/stagehand").then((m) => m),
        catch: wrapError("Stagehand", "createInstance"),
      });

      const stagehand = new V3({
        ...options,
        disablePino: true, // Pino uses worker threads, not supported in Workers
      });

      yield* Effect.tryPromise({
        try: () => stagehand.init(),
        catch: wrapError("Stagehand", "init"),
      });

      return stagehand;
    });

  /**
   * Build V3Options model config from StagehandConfig.
   */
  const buildModelConfig = () => {
    const maybeBaseUrl = Option.fromNullishOr(config.baseURL);
    return Option.match(maybeBaseUrl, {
      onNone: () => ({ modelName: config.model, apiKey: config.apiKey }),
      onSome: (baseURL) => ({ modelName: config.model, apiKey: config.apiKey, baseURL }),
    });
  };

  /**
   * Build V3Options from a CDP URL.
   */
  const buildOptions = (cdpUrl: string): V3Options => ({
    env: "LOCAL",
    localBrowserLaunchOptions: { cdpUrl },
    model: buildModelConfig(),
  });

  /**
   * Create a StagehandInstance wrapper from a raw V3 instance.
   */
  const makeInstance = (stagehand: V3) => ({
    use: <A>(
      f: (stagehand: V3, signal: AbortSignal) => Promise<A>,
    ): Effect.Effect<A, StagehandError> =>
      Effect.tryPromise({
        try: (signal) => f(stagehand, signal),
        catch: wrapError("StagehandInstance", "use"),
      }),
  });

  // ── Primitives (escape hatch — Scope.Scope in R) ─────────────────────────────

  const acquireSession = Effect.fn("Stagehand.acquireSession")(
    <T extends BrowserProviderSessionBase, O>(source: {
      provider: BrowserProviderService<T, O>;
      options?: O;
    }): Effect.Effect<
      StagehandSessionScope<T & BrowserProviderSession>,
      StagehandError | BrowserProviderError,
      Scope.Scope
    > =>
      Effect.gen(function* () {
        const session = yield* Effect.acquireRelease(
          source.provider.createSession(source.options),
          (s: T) => source.provider.releaseSession(s.id).pipe(Effect.catch(Effect.logError)),
        );

        const cdpUrlOption = source.provider.getCdpUrl(session.id);
        const cdpUrl = yield* Option.match(cdpUrlOption, {
          onNone: () =>
            Effect.fail(
              new StagehandError({
                module: "Stagehand",
                method: "acquireSession",
                reason: new ConnectionReason({
                  description:
                    "Provider does not support CDP connections. See BrowserProvider docs for compatible providers.",
                }),
              }),
            ),
          onSome: (url) => Effect.succeed(url),
        });

        const sessionWithCdp = { ...session, cdpUrl };
        const options = buildOptions(Redacted.value(cdpUrl));

        const stagehand = yield* Effect.acquireRelease(createInstance(options), (sh) =>
          Effect.tryPromise({ try: () => sh.close(), catch: () => undefined }).pipe(Effect.orDie),
        );

        const instance = makeInstance(stagehand);
        return { session: sessionWithCdp, instance };
      }),
  );

  const acquireConnection = Effect.fn("Stagehand.acquireConnection")(
    (
      source: { readonly url: string } | { readonly session: BrowserProviderSession },
    ): Effect.Effect<StagehandConnectionScope, StagehandError, Scope.Scope> =>
      Effect.gen(function* () {
        const cdpUrl = resolveConnectionSource(source);
        const options = buildOptions(cdpUrl);

        const stagehand = yield* Effect.acquireRelease(createInstance(options), (sh) =>
          Effect.tryPromise({ try: () => sh.close(), catch: () => undefined }).pipe(Effect.orDie),
        );

        const instance = makeInstance(stagehand);
        return { instance };
      }),
  );

  // ── Callback wrappers (sugar over the primitives) ───────────────────────────

  const withSession = Effect.fn("Stagehand.withSession")(
    <T extends BrowserProviderSessionBase, O, A, E, R>(
      source: { provider: BrowserProviderService<T, O>; options?: O },
      fn: (scope: StagehandSessionScope<T & BrowserProviderSession>) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | StagehandError | BrowserProviderError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const sessionScope = yield* acquireSession(source);
        return yield* fn(sessionScope);
      }).pipe(Effect.scoped),
  );

  const withConnection = Effect.fn("Stagehand.withConnection")(
    <A, E, R>(
      source: { readonly url: string } | { readonly session: BrowserProviderSession },
      fn: (scope: StagehandConnectionScope) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | StagehandError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const connectionScope = yield* acquireConnection(source);
        return yield* fn(connectionScope);
      }).pipe(Effect.scoped),
  );

  return {
    acquireSession,
    acquireConnection,
    withSession,
    withConnection,
  } satisfies StagehandService;
});

// ── Service Definition ────────────────────────────────────────────────────────

/**
 * Service tag for the Stagehand browser service.
 *
 * **When to use**
 *
 * Use when you need AI-powered browser automation — natural-language
 * actions (`act`), structured data extraction from pages (`extract`), or
 * observation (`observe`). Every call hits an LLM, so this module costs
 * money and adds latency compared to the deterministic Playwright and Cdp
 * modules.
 *
 * **Mental model**
 *
 * Like the other drivers, the API exposes two tracks, but only at the session
 * and connection levels — there is no page level, because the Stagehand
 * `instance` owns its page:
 *
 * - **Callbacks** (`withSession` / `withConnection`) open a connection, run an
 *   inner effect with an `instance`, and close it when the effect completes.
 * - **Primitives** (`acquireSession` / `acquireConnection`) return the
 *   `instance` bound to the caller's ambient `Scope`, so it can outlive a
 *   single block.
 *
 * **Common tasks**
 *
 * - Drive a page with a natural-language instruction via
 *   `instance.use((s) => s.act("..."))`.
 * - Pull typed data from a page with
 *   `instance.use((s) => s.extract("...", schema))`.
 * - Provision a remote session through a `BrowserProviderService` and drive it
 *   with `withSession`.
 *
 * **Example** (Act on a page, then extract structured data)
 *
 * ```typescript
 * import { Stagehand } from "@effect-libs/browser-stagehand";
 * import { Effect } from "effect";
 * import { z } from "zod";
 *
 * const program = Effect.gen(function* () {
 *   const stagehand = yield* Stagehand;
 *
 *   return yield* stagehand.withConnection({ url: "wss://..." }, ({ instance }) =>
 *     Effect.gen(function* () {
 *       yield* instance.use((s) => s.act("click the login button"));
 *       return yield* instance.use((s) =>
 *         s.extract("get the price", z.object({ price: z.string() })),
 *       );
 *     }),
 *   );
 * });
 *
 * Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(
 *       Stagehand.layer({ model: "openai/gpt-4o", apiKey: "<llm-api-key>" }),
 *     ),
 *   ),
 * );
 * ```
 *
 * **Gotchas**
 *
 * - Primitives require `Scope` in their environment; without an ambient scope,
 *   or if disposal is skipped, the Stagehand instance and its browser can leak.
 * - An `AsyncLocalStorage` polyfill is imported for Cloudflare Workers
 *   compatibility, and Pino logging is disabled because it spawns worker threads.
 * - Every `act` / `extract` / `observe` call hits an LLM, so it costs money and
 *   adds latency compared to the deterministic Playwright or CDP drivers.
 *
 * @see {@link StagehandService} for the full service contract
 *
 * @category services
 * @since 0.1.0
 */
export class Stagehand extends Context.Service<Stagehand, StagehandService>()(
  "effect-libs/browser/Stagehand",
  { make },
) {
  static readonly layerNoDeps: Layer.Layer<Stagehand, never, StagehandConfig> = Layer.effect(
    this,
    this.make,
  );

  static readonly layer = (config: StagehandConfigService): Layer.Layer<Stagehand> =>
    this.layerNoDeps.pipe(Layer.provide(StagehandConfig.layer(config)));

  static readonly layerConfig = (
    options: StagehandConfigOptions,
  ): Layer.Layer<Stagehand, Config.ConfigError> =>
    Layer.effectContext(
      Effect.gen(function* () {
        const model = yield* options.model;
        const apiKeyRedacted = yield* options.apiKey;
        const baseURL = options.baseURL ? yield* options.baseURL : undefined;

        const cfg: StagehandConfigService = {
          model,
          apiKey: Redacted.value(apiKeyRedacted),
          baseURL,
        };

        const stagehand = yield* make.pipe(Effect.provide(StagehandConfig.layer(cfg)));
        return Context.make(Stagehand, stagehand);
      }),
    );
}
