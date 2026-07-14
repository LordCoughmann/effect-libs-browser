/**
 * Geolocation override types for CDP.
 *
 * Mirrors Playwright's `BrowserContext.setGeolocation()` semantics. Context
 * owns the override; every page in the context receives it via
 * `Emulation.setGeolocationOverride`.
 *
 * The public API exposes only `latitude`, `longitude`, and `accuracy` —
 * matching Playwright's `types.Geolocation`. The underlying CDP call
 * (`Emulation.setGeolocationOverride`) accepts additional fields
 * (altitude, altitudeAccuracy, heading, speed), but those are not
 * surfaced here to keep the public surface aligned with Playwright.
 *
 * @see https://wicg.github.io/geolocation-api/ for the underlying
 *   Geolocation API spec.
 */

/**
 * Geolocation coordinates to override.
 *
 * Mirrors Playwright's `types.Geolocation`. Sent to the browser via
 * `Emulation.setGeolocationOverride`. After this is set on a context,
 * `navigator.geolocation.getCurrentPosition` resolves with these
 * coordinates on every page in the context.
 *
 * @example
 * ```typescript
 * yield* context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
 * ```
 */
export interface Geolocation {
  /** Latitude in degrees. Range: -90 to 90. */
  readonly latitude: number;
  /** Longitude in degrees. Range: -180 to 180. */
  readonly longitude: number;
  /**
   * Accuracy in meters. Optional; defaults to 0 (exact) when omitted.
   */
  readonly accuracy?: number;
}
