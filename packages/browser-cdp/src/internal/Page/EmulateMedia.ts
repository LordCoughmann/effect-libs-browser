/**
 * Emulate CSS media features for the page.
 *
 * Mirrors Playwright's `page.emulateMedia({ colorScheme?, reducedMotion?,
 * forcedColors?, media? })`. Uses CDP `Emulation.setEmulatedMedia`.
 *
 * Validates inputs upfront because CDP itself accepts (and silently ignores)
 * invalid values. The string `"null"` clears the corresponding emulation
 * (it is mapped to CDP's `null` value for the `media` field, and to the
 * literal string `"null"` for the `features` array, which CDP also
 * recognises as the no-override sentinel).
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CommandError } from "../../CdpError.js";
import { attachToTarget } from "./AttachToTarget.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

/** Options for `emulateMedia`. */
export interface EmulateMediaOptions {
  /** Emulate `prefers-color-scheme`. */
  readonly colorScheme?: "light" | "dark" | "no-preference" | "null";
  /** Emulate `prefers-reduced-motion`. */
  readonly reducedMotion?: "reduce" | "no-preference" | "null";
  /** Emulate `forced-colors`. */
  readonly forcedColors?: "active" | "none" | "null";
  /** Override the media type (e.g. `"screen"`, `"print"`). */
  readonly media?: "screen" | "print" | "null";
}

const VALID_COLOR_SCHEMES = new Set(["light", "dark", "no-preference", "null"]);
const VALID_REDUCED_MOTION = new Set(["reduce", "no-preference", "null"]);
const VALID_FORCED_COLORS = new Set(["active", "none", "null"]);
const VALID_MEDIA = new Set(["screen", "print", "null"]);

const failEmulateMedia = (description: string): CdpError =>
  new CdpError({
    module: "CdpPage",
    method: "emulateMedia",
    reason: new CommandError({
      method: "Emulation.setEmulatedMedia",
      description,
    }),
  });

/**
 * Validate the options object. Returns an error description if any field
 * is invalid; otherwise `undefined`.
 */
const validateEmulateMediaOptions = (options: EmulateMediaOptions): string | undefined => {
  if (options.media !== undefined && !VALID_MEDIA.has(options.media)) {
    return `media: expected one of (screen|print|no-override), got '${options.media}'`;
  }
  if (options.colorScheme !== undefined && !VALID_COLOR_SCHEMES.has(options.colorScheme)) {
    return `colorScheme: expected one of (dark|light|no-preference|no-override), got '${options.colorScheme}'`;
  }
  if (options.reducedMotion !== undefined && !VALID_REDUCED_MOTION.has(options.reducedMotion)) {
    return `reducedMotion: expected one of (reduce|no-preference|no-override), got '${options.reducedMotion}'`;
  }
  if (options.forcedColors !== undefined && !VALID_FORCED_COLORS.has(options.forcedColors)) {
    return `forcedColors: expected one of (active|none|no-override), got '${options.forcedColors}'`;
  }
  return undefined;
};

/**
 * Emulates a media type or media feature for CSS media queries.
 *
 * Each option uses `"null"` to clear the emulation. Empty object (`{}`) is
 * a no-op (clears all emulations).
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param targetId - CDP target ID for this page (used to lazily attach a session)
 * @param options - Media features to emulate
 */
export const emulateMedia = Effect.fn("CdpPage.emulateMedia")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  targetId: string,
  options: EmulateMediaOptions,
) {
  return Effect.gen(function* () {
    // Validate inputs upfront — CDP accepts invalid values silently.
    const validationError = validateEmulateMediaOptions(options);
    if (validationError !== undefined) {
      return yield* failEmulateMedia(validationError);
    }

    // Attach the session lazily if it hasn't been attached yet (matches
    // the pattern used by `goto`, `exposeFunction`, etc.).
    const currentSid = yield* Ref.get(state.sessionId);
    if (!currentSid) {
      yield* attachToTarget(conn, state, targetId);
    }
    const sessionId = yield* ensureSession(state);

    const features: Array<{ name: string; value: string }> = [];
    if (options.colorScheme !== undefined) {
      features.push({ name: "prefers-color-scheme", value: options.colorScheme });
    }
    if (options.reducedMotion !== undefined) {
      features.push({ name: "prefers-reduced-motion", value: options.reducedMotion });
    }
    if (options.forcedColors !== undefined) {
      features.push({ name: "forced-colors", value: options.forcedColors });
    }

    // CDP's `media` field is `string | undefined`. The string "" (empty)
    // disables the override; passing JS `null` is a type error. Map the
    // upstream `"null"` sentinel to the empty string so the emulation is
    // cleared rather than treated as an invalid media string.
    const mediaParam =
      options.media === undefined ? undefined : options.media === "null" ? "" : options.media;

    yield* conn.cdp.Emulation.setEmulatedMedia(
      {
        media: mediaParam,
        features,
      },
      sessionId,
    ).pipe(Effect.mapError((cause) => failEmulateMedia(getErrorMessage(cause))));
  });
});
