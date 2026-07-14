/**
 * Stagehand service interfaces — scopes and service definition.
 *
 * Type-only file. No runtime code. All implementation lives in `Stagehand.ts`.
 *
 * Stagehand does not expose context/page ownership — two levels only:
 * `withSession` (session + instance) and `withConnection` (instance only).
 * No `withPage` — the instance IS the unit of work.
 *
 * @category models
 * @since 0.1.0
 */

import type { V3 } from "@browserbasehq/stagehand";
import type { Effect, Scope } from "effect";

import type {
  BrowserProviderError,
  BrowserProviderService,
  BrowserProviderSession,
  BrowserProviderSessionBase,
} from "@effect-libs/browser";

import type { StagehandError } from "./StagehandError.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Stagehand instance with `use` pattern for operations.
 *
 * The instance wraps a Stagehand V3 client and provides seamless Effect integration
 * via the `use` pattern. The full Stagehand V3 API (act, extract, observe) is
 * available in the callback.
 *
 * @example
 * ```typescript
 * import { Stagehand } from "@effect-libs/browser-stagehand";
 * import { Effect } from "effect";
 * import { z } from "zod";
 *
 * const data = yield* instance.use((s) =>
 *   s.extract("get the product price", z.object({ price: z.string() })),
 * );
 * ```
 *
 * @category models
 * @since 0.1.0
 */
export interface StagehandInstance {
  /**
   * Execute a function with the Stagehand instance.
   *
   * Provides automatic abort signal handling for Effect cancellation.
   * Full Stagehand V3 API is available in the callback:
   * - `s.act("action description")` — AI-powered browser actions
   * - `s.extract("extraction description", schema)` — structured data extraction
   * - `s.observe()` — observe page state
   *
   * @param f - Callback receiving the Stagehand V3 instance and an AbortSignal.
   *
   * @example
   * ```typescript
   * // AI-powered action
   * yield* instance.use((s) => s.act("click the login button"));
   *
   * // Structured extraction
   * const result = yield* instance.use((s) =>
   *   s.extract("get price", z.object({ price: z.string() })),
   * );
   * ```
   */
  readonly use: <A>(
    f: (stagehand: V3, signal: AbortSignal) => Promise<A>,
  ) => Effect.Effect<A, StagehandError>;
}

// ── Scopes ────────────────────────────────────────────────────────────────────
// Bundles handed to `withX` callbacks / returned by `acquireX` primitives.

/**
 * Scope callback for {@link StagehandService.withSession} / return value of
 * {@link StagehandService.acquireSession}.
 *
 * The outermost scope for Stagehand. The provider allocates a fresh browser
 * and all resources are released when the callback completes.
 *
 * **When to use:**
 * - One-off AI-powered scraping jobs
 * - Each request needs a clean browser slate
 * - Single-operation AI automation
 *
 * @example
 * ```typescript
 * import { Stagehand } from "@effect-libs/browser-stagehand";
 * import { BrowserProvider } from "@effect-libs/browser";
 * import { Effect } from "effect";
 * import { z } from "zod";
 *
 * const scrapeProduct = (url: string) =>
 *   Effect.gen(function* () {
 *     const stagehand = yield* Stagehand;
 *     const provider = yield* BrowserProvider;
 *
 *     return yield* stagehand.withSession({ provider }, ({ instance }) =>
 *       Effect.gen(function* () {
 *         yield* instance.use((s) => s.act(`navigate to ${url}`));
 *         return yield* instance.use((s) =>
 *           s.extract("get product title", z.object({ title: z.string() })),
 *         );
 *       }),
 *     );
 *   });
 * ```
 *
 * @see [`browser-stagehand`](../../docs/modules/stagehand/index.md) for full API reference.
 *
 * @category models
 * @since 0.1.0
 */
export interface StagehandSessionScope<S extends BrowserProviderSession = BrowserProviderSession> {
  /**
   * The provider session: holds `id`, `cdpUrl`, `createdAt`, and `liveViewUrl`.
   * Use `session.id` to reference this session in provider API calls.
   *
   * @see {@link BrowserProviderSession} for the session shape.
   */
  readonly session: S;
  /**
   * The Stagehand instance for AI-powered browser operations.
   *
   * Use `instance.use((s) => ...)` to execute Stagehand actions:
   * - `s.act("action")` — AI-powered browser actions
   * - `s.extract("description", schema)` — structured data extraction
   * - `s.observe()` — observe page state
   *
   * @see {@link StagehandInstance} for all available methods.
   */
  readonly instance: StagehandInstance;
}

/**
 * Scope callback for {@link StagehandService.withConnection} / return value of
 * {@link StagehandService.acquireConnection}.
 *
 * A connection provides access to a Stagehand instance without managing the
 * session lifecycle, for connecting to an existing browser.
 *
 * **When to use:**
 * - Human-in-the-loop: an operator completed login, now AI automation runs
 * - Reuse a session across multiple AI operations
 * - Provider session created elsewhere
 *
 * @example
 * ```typescript
 * import { Stagehand } from "@effect-libs/browser-stagehand";
 * import { Effect } from "effect";
 * import { z } from "zod";
 *
 * // Operator logged in via live view; connect to the same session
 * const data = yield* stagehand.withConnection({ url: cdpUrl }, ({ instance }) =>
 *   Effect.gen(function* () {
 *     // Authenticated; AI can extract data from protected pages
 *     return yield* instance.use((s) =>
 *       s.extract("get dashboard data", z.object({ balance: z.string() })),
 *     );
 *   }),
 * );
 * ```
 *
 * @see [`browser-stagehand`](../../docs/modules/stagehand/index.md) for full API reference.
 *
 * @category models
 * @since 0.1.0
 */
export interface StagehandConnectionScope {
  /**
   * The Stagehand instance for AI-powered browser operations.
   *
   * Use `instance.use((s) => ...)` to execute Stagehand actions:
   * - `s.act("action")` — AI-powered browser actions
   * - `s.extract("description", schema)` — structured data extraction
   * - `s.observe()` — observe page state
   *
   * @see {@link StagehandInstance} for all available methods.
   */
  readonly instance: StagehandInstance;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * High-level Stagehand AI browser service.
 *
 * Provides scoped resource management for Stagehand sessions and connections.
 * Wraps @browserbasehq/stagehand with the `use` pattern for seamless Effect
 * integration and AI-powered browser automation.
 *
 * Two levels only (no context/page — the instance IS the unit of work):
 * - **Callback** (`withSession` / `withConnection`): the library owns the scope;
 *   resources close when the callback returns.
 * - **Primitive** (`acquireSession` / `acquireConnection`): the caller owns the
 *   scope (`Effect.scoped`, or a long-lived `Scope.make()` for pooling).
 *
 * @example
 * ```typescript
 * import { Stagehand, BrowserProvider } from "@effect-libs/browser";
 * import { Effect } from "effect";
 * import { z } from "zod";
 *
 * const program = Effect.gen(function* () {
 *   const stagehand = yield* Stagehand;
 *   const provider = yield* BrowserProvider;
 *
 *   const data = yield* stagehand.withSession({ provider }, ({ instance }) =>
 *     Effect.gen(function* () {
 *       yield* instance.use((s) => s.act("navigate to example.com"));
 *       return yield* instance.use((s) =>
 *         s.extract("get page title", z.object({ title: z.string() })),
 *       );
 *     }),
 *   );
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(Stagehand.layer)));
 * ```
 *
 * @see [`browser-stagehand`](../../docs/modules/stagehand/index.md) for full API reference.
 * @see [Advanced scoping](../../docs/guides/advanced-scoping.md) for the acquireX primitives and pooling.
 *
 * @category services
 * @since 0.1.0
 */
export interface StagehandService {
  /**
   * Creates a fresh browser session that automatically closes when the callback
   * returns. The callback receives `session` and `instance`.
   *
   * @param source - `{ provider, options? }`: provider service and optional session options.
   * @param fn - Callback receiving a {@link StagehandSessionScope} with `session` and `instance`.
   *
   * @example
   * ```typescript
   * const result = yield* stagehand.withSession({ provider }, ({ instance }) =>
   *   Effect.gen(function* () {
   *     yield* instance.use((s) => s.act("click the login button"));
   *     return yield* instance.use((s) =>
   *       s.extract("get welcome message", z.object({ message: z.string() })),
   *     );
   *   }),
   * );
   * ```
   */
  readonly withSession: <T extends BrowserProviderSessionBase, O, A, E, R>(
    source: { readonly provider: BrowserProviderService<T, O>; readonly options?: O },
    fn: (scope: StagehandSessionScope<T & BrowserProviderSession>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | StagehandError | BrowserProviderError, Exclude<R, Scope.Scope>>;

  /**
   * Connects to an existing browser; the connection automatically closes when
   * the callback returns. The callback receives `instance` only.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   * @param fn - Callback receiving a {@link StagehandConnectionScope} with `instance`.
   *
   * @example
   * ```typescript
   * // Connect to an existing session
   * const result = yield* stagehand.withConnection({ url: cdpUrl }, ({ instance }) =>
   *   instance.use((s) => s.extract("get data", z.object({ value: z.string() }))),
   * );
   * ```
   */
  readonly withConnection: <A, E, R>(
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
    fn: (scope: StagehandConnectionScope) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | StagehandError, Exclude<R, Scope.Scope>>;

  /**
   * Creates a fresh browser session in the caller's scope. The primitive form
   * of {@link withSession}: no callback, so the session can outlive a single
   * operation. Requires `Scope.Scope`.
   *
   * Use for pooling, fan-out, or long-lived workers. Close with `Effect.scoped`
   * or a long-lived `Scope.make()`.
   *
   * @param source - `{ provider, options? }`: provider service and optional session options.
   *
   * @example
   * ```typescript
   * const { session, instance } = yield* stagehand
   *   .acquireSession({ provider })
   *   .pipe(Effect.scoped);
   * ```
   */
  readonly acquireSession: <T extends BrowserProviderSessionBase, O>(source: {
    readonly provider: BrowserProviderService<T, O>;
    readonly options?: O;
  }) => Effect.Effect<
    StagehandSessionScope<T & BrowserProviderSession>,
    StagehandError | BrowserProviderError,
    Scope.Scope
  >;

  /**
   * Connects to an existing browser in the caller's scope. The primitive form
   * of {@link withConnection}: no callback, so the connection can stay alive
   * across operations. Requires `Scope.Scope`.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   *
   * @example
   * ```typescript
   * const { instance } = yield* stagehand
   *   .acquireConnection({ url: cdpUrl })
   *   .pipe(Effect.scoped);
   * ```
   */
  readonly acquireConnection: (
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
  ) => Effect.Effect<StagehandConnectionScope, StagehandError, Scope.Scope>;
}
