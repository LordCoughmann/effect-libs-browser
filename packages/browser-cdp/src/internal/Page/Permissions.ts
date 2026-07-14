/**
 * Permission management types for CDP.
 *
 * Mirrors Playwright's `BrowserContext.grantPermissions()` and
 * `BrowserContext.clearPermissions()` semantics. The public API uses
 * Web Platform permission names (kebab-case, as exposed by
 * `navigator.permissions`); these are mapped internally to CDP
 * `PermissionType` strings (camelCase) before sending.
 *
 * @see https://wicg.github.io/permissions/ for the underlying spec.
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-grantPermissions
 *   for the CDP method.
 */

/**
 * Names of permissions the public API accepts.
 *
 * These are the Web Platform permission names from `navigator.permissions`
 * (kebab-case). The subset is a curated set of permissions that are
 * practically useful for scraping and agent flows, mirroring Playwright's
 * surface plus a few Chrome-specific additions.
 *
 * To map a name to the corresponding CDP `PermissionType` string, see
 * {@link toCdpPermissionType}.
 */
export type PermissionName =
  | "geolocation"
  | "notifications"
  | "clipboard-read"
  | "clipboard-write"
  | "camera"
  | "microphone"
  | "midi"
  | "midi-sysex"
  | "background-sync"
  | "payment-handler"
  | "storage-access"
  | "local-fonts"
  | "local-network-access"
  | "ambient-light-sensor"
  | "accelerometer"
  | "gyroscope"
  | "magnetometer"
  | "display-capture"
  | "screen-wake-lock"
  | "window-management";

/**
 * Options for `grantPermissions`.
 *
 * @property origin - Restrict the grant to a specific origin URL. When
 *   omitted, all origins are granted.
 */
export interface GrantPermissionsOptions {
  /** Restrict the grant to a specific origin URL (e.g. `"https://example.com"`). */
  readonly origin?: string;
}

/**
 * Map a single Web Platform permission name to a CDP `PermissionType` string
 * (or array of strings, in the case of `local-network-access`).
 *
 * Returns `undefined` if the name is not a recognized permission. The
 * mapping mirrors Playwright's `webPermissionToProtocol` table
 * (`crBrowser.ts:doGrantPermissions`).
 */
const PERMISSION_MAP: Record<PermissionName, string | ReadonlyArray<string>> = {
  geolocation: "geolocation",
  notifications: "notifications",
  "clipboard-read": "clipboardReadWrite",
  "clipboard-write": "clipboardSanitizedWrite",
  camera: "videoCapture",
  microphone: "audioCapture",
  midi: "midi",
  "midi-sysex": "midiSysex",
  "background-sync": "backgroundSync",
  "payment-handler": "paymentHandler",
  "storage-access": "storageAccess",
  "local-fonts": "localFonts",
  "local-network-access": ["localNetworkAccess", "localNetwork", "loopbackNetwork"],
  "ambient-light-sensor": "sensors",
  accelerometer: "sensors",
  gyroscope: "sensors",
  magnetometer: "sensors",
  "display-capture": "displayCapture",
  "screen-wake-lock": "wakeLockScreen",
  "window-management": "windowManagement",
};

export const toCdpPermissionType = (
  name: PermissionName,
): string | ReadonlyArray<string> | undefined => PERMISSION_MAP[name];
