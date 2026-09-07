/**
 * Shared layer scaffolding for browser providers.
 *
 * Every HTTP-backed provider (Steel, Browserbase, Cloudflare Browser Run)
 * publishes the same dual-key layer shape: the concrete `*Provider` tag plus
 * the generic `BrowserProvider` tag. These helpers centralize that wiring so
 * each provider only defines its own `make` factory and session logic.
 *
 * @category internal
 * @since 0.2.0
 */

import { Context, Effect, Layer } from "effect";

import { BrowserProvider, type BrowserProviderService } from "@effect-libs/browser";

/**
 * The `Identifier` of the generic `BrowserProvider` tag (its class instance
 * type). Deriving it from the tag keeps the helper free of the
 * `typeof BrowserProvider` / instance-type mismatch that class-style
 * `Context.Service` keys carry.
 *
 * @internal
 * @since 0.2.0
 */
type BrowserProviderIdentifier =
  typeof BrowserProvider extends Context.Key<infer I, any> ? I : never;

/**
 * Build the dual-key Context that satisfies both the concrete provider tag and
 * the generic `BrowserProvider` tag from a single implementation.
 *
 * @internal
 * @since 0.2.0
 */
export const makeProviderContext = <I, Impl extends BrowserProviderService>(
  tag: Context.Key<I, Impl>,
  impl: Impl,
): Context.Context<I | BrowserProviderIdentifier> =>
  Context.make(tag, impl).pipe(Context.add(BrowserProvider, impl));

/**
 * Build a `layer` factory from a provider `make` factory.
 *
 * Wraps the implementation in `Layer.effectContext`, publishing both the
 * concrete provider tag and `BrowserProvider`.
 *
 * @internal
 * @since 0.2.0
 */
export const makeProviderLayer =
  <I, Impl extends BrowserProviderService, Options>(
    tag: Context.Key<I, Impl>,
    make: (options: Options) => Effect.Effect<Impl, never, never>,
  ): ((options: Options) => Layer.Layer<I | BrowserProviderIdentifier>) =>
  (options) =>
    Layer.effectContext(make(options).pipe(Effect.map((impl) => makeProviderContext(tag, impl))));
