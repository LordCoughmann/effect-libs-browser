import { Config, Context, Effect, Layer } from "effect";

/**
 * Default Steel API endpoint
 */
const DEFAULT_STEEL_ENDPOINT = "wss://connect.steel.dev";

/**
 * Configuration for CDP connection
 */
export interface CdpConfigService {
  /** Base WebSocket endpoint for CDP connection (e.g., "wss://connect.steel.dev") */
  readonly endpoint: string;
  /** Timeout in milliseconds for CDP commands */
  readonly commandTimeoutMs: number;
  /** Timeout in milliseconds for connection */
  readonly connectTimeoutMs: number;
  /** Buffer size for the internal PubSub event bus */
  readonly eventBufferSize: number;
  /** Enable debug logging */
  readonly debug: boolean;
}

/**
 * Creates a CDP configuration service by reading values from environment variables.
 *
 * Environment variables:
 * - CDP_ENDPOINT: WebSocket endpoint for CDP connection (defaults to Steel's endpoint)
 * - CDP_COMMAND_TIMEOUT_MS: Timeout for CDP commands in milliseconds (defaults to 30000)
 * - CDP_CONNECT_TIMEOUT_MS: Timeout for connection in milliseconds (defaults to 20000)
 * - CDP_DEBUG: Enable debug logging when set to "true" (defaults to false)
 */
const make = Effect.gen(function* () {
  return yield* Config.all({
    endpoint: Config.string("CDP_ENDPOINT").pipe(Config.withDefault(DEFAULT_STEEL_ENDPOINT)),
    commandTimeoutMs: Config.number("CDP_COMMAND_TIMEOUT_MS").pipe(Config.withDefault(30_000)),
    connectTimeoutMs: Config.number("CDP_CONNECT_TIMEOUT_MS").pipe(Config.withDefault(20_000)),
    eventBufferSize: Config.number("CDP_EVENT_BUFFER_SIZE").pipe(Config.withDefault(256)),
    debug: Config.boolean("CDP_DEBUG").pipe(Config.withDefault(false)),
  });
}).pipe(Effect.orDie);

/**
 * Service tag for CdpConfig
 * Using Context.Service with make option for dependency injection
 */
export class CdpConfig extends Context.Service<CdpConfig, CdpConfigService>()(
  "effect-libs/browser/CdpConfig",
  {
    make,
  },
) {
  /**
   * Fully composed layer (for production).
   */
  static readonly layer: Layer.Layer<CdpConfig> = Layer.effect(this, this.make);

  /**
   * Test layer with fast timeouts for unit tests.
   */
  static readonly layerTest = Layer.succeed(this, {
    endpoint: DEFAULT_STEEL_ENDPOINT,
    commandTimeoutMs: 5_000,
    connectTimeoutMs: 2_000,
    eventBufferSize: 256,
    debug: false,
  });

  /**
   * Custom layer for specific test scenarios.
   */
  static readonly layerCustom = (config: Partial<CdpConfigService>) =>
    Layer.succeed(this, {
      endpoint: config.endpoint ?? DEFAULT_STEEL_ENDPOINT,
      commandTimeoutMs: config.commandTimeoutMs ?? 30_000,
      connectTimeoutMs: config.connectTimeoutMs ?? 20_000,
      eventBufferSize: config.eventBufferSize ?? 256,
      debug: config.debug ?? false,
    });
}
