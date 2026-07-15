/**
 * Press key operation via CDP.
 *
 * Supports special keys (Enter, Tab, Escape, ArrowUp, etc.), single characters
 * (including shifted characters like "!", "+"), and modifier combinations
 * like "Shift+Tab", "Control+A".
 *
 * Key resolution uses the full US keyboard layout (from KeyboardLayout.ts),
 * matching Playwright's bi-directional key→description map.
 */

import type { Duration } from "effect";

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, SelectorError } from "../../CdpError.js";
import { sleep } from "../sleep.js";
import { ensureSession } from "./EnsureSession.js";
import {
  getShiftedKey,
  isPrintableASCII,
  modifierFlag,
  resolveKeyDescription,
} from "./KeyboardLayout.js";
import { type PageState } from "./PageState.js";
import { ELEMENT_NOT_FOUND, retryWithElement } from "./RetryWithElement.js";

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Split a key combination string like "Shift+Tab" into tokens.
 * Handles single-character keys (e.g. "a", "1") and special keys.
 */
function splitKeyCombo(keyString: string): string[] {
  const keys: string[] = [];
  let building = "";
  for (const char of keyString) {
    if (char === "+" && building) {
      keys.push(building);
      building = "";
    } else {
      building += char;
    }
  }
  keys.push(building);
  return keys;
}

// ── Focus helper ─────────────────────────────────────────────────────────

/**
 * Focus an element by selector using retry approach.
 * Matches Playwright's behavior: evaluate `el.focus()` in the page context.
 * For input elements, resets selection to (0, 0) if the element wasn't already focused.
 */
const focusElement = (
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  timeout: Duration.Duration,
) =>
  retryWithElement(
    conn,
    state,
    ([sel]: [string]) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return ELEMENT_NOT_FOUND;
      const wasFocused = document.activeElement === el;
      el.focus();
      // Reset selection on inputs if not already focused (matches Playwright)
      if (!wasFocused && el.nodeName.toLowerCase() === "input") {
        try {
          (el as HTMLInputElement).setSelectionRange(0, 0);
        } catch {
          // Some inputs do not allow selection
        }
      }
    },
    [selector],
    { timeout },
  );

// ── Press implementation ─────────────────────────────────────────────────

/**
 * Presses a key (with optional modifiers) on an element.
 *
 * Supports special keys like Enter, Tab, Escape, ArrowUp, etc., single
 * characters like "a" or "1" (including shifted: "!", "+"), and modifier
 * combinations like "Shift+Tab" or "Control+A".
 *
 * Key resolution uses the full US keyboard layout — any key name or printable
 * character recognized by the layout will resolve to the correct CDP event
 * properties (code, key, keyCode, text).
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param key - Key to press (e.g., "Enter", "Tab", "a", "Shift+Tab")
 * @param timeout - Maximum wait time
 */
export const pressKey = Effect.fn("CdpPage.press")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    key: string,
    timeout: Duration.Duration,
  ) =>
    Effect.gen(function* () {
      // Focus the target element
      yield* focusElement(conn, state, selector, timeout);

      const sessionId = yield* ensureSession(state);

      const mapInteractionError = Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            source: "CdpPage",
            method: "press",
            reason: new SelectorError({
              selector,
              description: `Key press failed: ${getErrorMessage(cause)}`,
            }),
          }),
      );

      // Parse key combination (e.g. "Shift+Tab" → ["Shift", "Tab"])
      const tokens = splitKeyCombo(key);
      const mainKeyName = tokens[tokens.length - 1];
      const modifierNames = tokens.slice(0, -1);

      // Resolve the main key via the keyboard layout map
      const resolved = resolveKeyDescription(mainKeyName);
      if (!resolved) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "press",
          reason: new SelectorError({
            selector,
            description: `Unknown key: "${mainKeyName}"`,
          }),
        });
      }

      // Determine text: if non-Shift modifiers are present, suppress text
      // (matches Playwright: Ctrl+A selects all, doesn't insert "a")
      const suppressText =
        modifierNames.length > 1 || (modifierNames.length === 1 && modifierNames[0] !== "Shift");

      // Check if Shift is in modifiers - if so, use shifted key if available
      const hasShift = modifierNames.includes("Shift");
      const shiftedKey = hasShift ? getShiftedKey(resolved.code) : null;

      // Use shifted key if available, otherwise use the resolved key
      const effectiveKey = shiftedKey ?? resolved.key;
      const effectiveText = suppressText ? "" : (shiftedKey ?? resolved.text);
      const hasText = effectiveText !== "";

      // Press modifier keys down (sequential — order matters)
      // Track the current modifier mask incrementally as we press each modifier
      let currentModifierMask = 0;
      yield* Effect.forEach(
        modifierNames,
        (modName) =>
          Effect.gen(function* () {
            const modDesc = resolveKeyDescription(modName);
            if (!modDesc) {
              return yield* new CdpError({
                source: "CdpPage",
                method: "press",
                reason: new SelectorError({
                  selector,
                  description: `Unknown modifier: "${modName}"`,
                }),
              });
            }
            // Add this modifier to the mask BEFORE sending keyDown
            // (the keyDown event should have the modifier already set, matching browser behavior)
            currentModifierMask |= modifierFlag[modName];
            yield* conn.cdp.Input.dispatchKeyEvent(
              {
                type: "rawKeyDown",
                code: modDesc.code,
                key: modDesc.key,
                windowsVirtualKeyCode: modDesc.keyCodeWithoutLocation,
                modifiers: currentModifierMask,
                ...(modDesc.location && { location: modDesc.location }),
              },
              sessionId,
            ).pipe(mapInteractionError);
          }),
        { concurrency: 1 },
      );

      // At this point, currentModifierMask equals the full modifiersMask
      // Press main key down with the current modifier mask
      yield* conn.cdp.Input.dispatchKeyEvent(
        {
          type: hasText ? "keyDown" : "rawKeyDown",
          code: resolved.code,
          key: effectiveKey,
          windowsVirtualKeyCode: resolved.keyCodeWithoutLocation,
          modifiers: currentModifierMask,
          ...(hasText && {
            text: effectiveText,
            unmodifiedText: effectiveText,
          }),
          ...(resolved.location && { location: resolved.location }),
        },
        sessionId,
      ).pipe(mapInteractionError);

      // Release main key (modifiers still held)
      yield* conn.cdp.Input.dispatchKeyEvent(
        {
          type: "keyUp",
          code: resolved.code,
          key: effectiveKey,
          windowsVirtualKeyCode: resolved.keyCodeWithoutLocation,
          modifiers: currentModifierMask,
          ...(resolved.location && { location: resolved.location }),
        },
        sessionId,
      ).pipe(mapInteractionError);

      // Release modifier keys (reverse order, sequential)
      // Track the mask as we release each modifier
      const reversedModifiers = [...modifierNames].reverse();
      yield* Effect.forEach(
        reversedModifiers,
        (modName) =>
          Effect.gen(function* () {
            const modDesc = resolveKeyDescription(modName);
            if (!modDesc) {
              return yield* new CdpError({
                source: "CdpPage",
                method: "press",
                reason: new SelectorError({
                  selector,
                  description: `Unknown modifier on release: "${modName}"`,
                }),
              });
            }
            // Remove this modifier from the mask BEFORE sending keyUp
            // (the keyUp event should reflect remaining pressed keys)
            currentModifierMask &= ~modifierFlag[modName];
            yield* conn.cdp.Input.dispatchKeyEvent(
              {
                type: "keyUp",
                code: modDesc.code,
                key: modDesc.key,
                windowsVirtualKeyCode: modDesc.keyCodeWithoutLocation,
                modifiers: currentModifierMask,
                ...(modDesc.location && { location: modDesc.location }),
              },
              sessionId,
            ).pipe(mapInteractionError);
          }),
        { concurrency: 1 },
      );
    }),
);

// ── keyboardDown/keyboardUp implementation ─────────────────────────────────

/** List of modifier key names for checking if a key is a modifier. */
const modifierKeyNames = ["Shift", "Control", "Alt", "Meta"];

/**
 * Presses a single key (keydown + keyup) at the current cursor position.
 *
 * Unlike `page.press(selector, key)`, this does not focus any element.
 * It presses the key on whatever is currently focused. This matches
 * Playwright's `keyboard.press(key)` behavior.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state (tracks modifier mask)
 * @param key - Key to press (e.g., "Enter", "Tab", "a", "Shift+Tab")
 */
export const keyboardPress = Effect.fn("CdpPage.keyboard.press")(
  (conn: CdpConnection["Service"], state: PageState, key: string) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      const mapError = Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            source: "CdpPage",
            method: "keyboard.press",
            reason: new SelectorError({
              selector: "",
              description: `Key press failed: ${getErrorMessage(cause)}`,
            }),
          }),
      );

      // Parse key combination (e.g. "Shift+Tab" → ["Shift", "Tab"])
      const tokens = splitKeyCombo(key);
      const mainKeyName = tokens[tokens.length - 1];
      const modifierNames = tokens.slice(0, -1);

      const resolved = resolveKeyDescription(mainKeyName);
      if (!resolved) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "keyboard.press",
          reason: new SelectorError({
            selector: "",
            description: `Unknown key: "${mainKeyName}"`,
          }),
        });
      }

      const suppressText =
        modifierNames.length > 1 || (modifierNames.length === 1 && modifierNames[0] !== "Shift");
      const hasShift = modifierNames.includes("Shift");
      const shiftedKey = hasShift ? getShiftedKey(resolved.code) : null;
      const effectiveKey = shiftedKey ?? resolved.key;
      const effectiveText = suppressText ? "" : (shiftedKey ?? resolved.text);
      const hasText = effectiveText !== "";

      // Press modifier keys down
      let currentModifierMask = 0;
      yield* Effect.forEach(
        modifierNames,
        (modName) =>
          Effect.gen(function* () {
            const modDesc = resolveKeyDescription(modName);
            if (!modDesc) {
              return yield* new CdpError({
                source: "CdpPage",
                method: "keyboard.press",
                reason: new SelectorError({
                  selector: "",
                  description: `Unknown modifier: "${modName}"`,
                }),
              });
            }
            currentModifierMask |= modifierFlag[modName];
            yield* conn.cdp.Input.dispatchKeyEvent(
              {
                type: "rawKeyDown",
                code: modDesc.code,
                key: modDesc.key,
                windowsVirtualKeyCode: modDesc.keyCodeWithoutLocation,
                modifiers: currentModifierMask,
                ...(modDesc.location && { location: modDesc.location }),
              },
              sessionId,
            ).pipe(mapError);
          }),
        { concurrency: 1 },
      );

      // Press main key down
      yield* conn.cdp.Input.dispatchKeyEvent(
        {
          type: hasText ? "keyDown" : "rawKeyDown",
          code: resolved.code,
          key: effectiveKey,
          windowsVirtualKeyCode: resolved.keyCodeWithoutLocation,
          modifiers: currentModifierMask,
          ...(hasText && { text: effectiveText, unmodifiedText: effectiveText }),
          ...(resolved.location && { location: resolved.location }),
        },
        sessionId,
      ).pipe(mapError);

      // Release main key
      yield* conn.cdp.Input.dispatchKeyEvent(
        {
          type: "keyUp",
          code: resolved.code,
          key: effectiveKey,
          windowsVirtualKeyCode: resolved.keyCodeWithoutLocation,
          modifiers: currentModifierMask,
          ...(resolved.location && { location: resolved.location }),
        },
        sessionId,
      ).pipe(mapError);

      // Release modifier keys (reverse order)
      const reversedModifiers = [...modifierNames].reverse();
      yield* Effect.forEach(
        reversedModifiers,
        (modName) =>
          Effect.gen(function* () {
            const modDesc = resolveKeyDescription(modName);
            if (!modDesc) return;
            currentModifierMask &= ~modifierFlag[modName];
            yield* conn.cdp.Input.dispatchKeyEvent(
              {
                type: "keyUp",
                code: modDesc.code,
                key: modDesc.key,
                windowsVirtualKeyCode: modDesc.keyCodeWithoutLocation,
                modifiers: currentModifierMask,
                ...(modDesc.location && { location: modDesc.location }),
              },
              sessionId,
            ).pipe(mapError);
          }),
        { concurrency: 1 },
      );
    }),
);

/**
 * Dispatches a keydown event for a key.
 *
 * Unlike `pressKey`, this only sends keydown (no keyup), allowing keys to be
 * held down. Used for modifier key combinations where keys need to be held.
 *
 * If the key is a modifier (Shift, Control, Alt, Meta), it updates the global
 * modifier mask BEFORE dispatching the event, so the keydown event shows the
 * modifier as pressed.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state (tracks modifier mask)
 * @param key - Key to press down (e.g., "Shift", "a", "ArrowLeft")
 */
export const keyboardDown = Effect.fn("CdpPage.keyboardDown")(
  (conn: CdpConnection["Service"], state: PageState, key: string) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      // Resolve the key via the keyboard layout map
      const resolved = resolveKeyDescription(key);
      if (!resolved) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "keyboardDown",
          reason: new SelectorError({
            selector: "",
            description: `Unknown key: "${key}"`,
          }),
        });
      }

      // Get current modifier mask from state
      let currentMask = yield* Ref.get(state.currentModifierMask);

      // Check if this key is already pressed (for autoRepeat)
      const pressedKeys = yield* Ref.get(state.pressedKeys);
      const isRepeat = pressedKeys.has(resolved.code);

      // Check if this key is a modifier
      const isModifier = modifierKeyNames.includes(resolved.key);

      // If it's a modifier, add it to the mask BEFORE dispatching keydown
      if (isModifier) {
        currentMask |= modifierFlag[resolved.key as keyof typeof modifierFlag];
        yield* Ref.set(state.currentModifierMask, currentMask);
      }

      // Check if Shift is in the current mask for shifted key handling
      const hasShift = (currentMask & modifierFlag.Shift) !== 0;
      const shiftedKey = hasShift ? getShiftedKey(resolved.code) : null;
      const effectiveKey = shiftedKey ?? resolved.key;
      const effectiveText = shiftedKey ?? resolved.text;

      // For non-modifier keys, check if non-Shift modifiers are present
      // If so, suppress text (no keypress event)
      // This matches browser behavior: Alt+! doesn't produce a printable character
      const hasNonShiftModifier =
        (currentMask & (modifierFlag.Control | modifierFlag.Alt | modifierFlag.Meta)) !== 0;
      const suppressText = hasNonShiftModifier;
      const hasText = effectiveText !== "" && !isModifier && !suppressText;

      // Dispatch keydown with current modifier mask and autoRepeat if needed
      yield* conn.cdp.Input.dispatchKeyEvent(
        {
          type: hasText ? "keyDown" : "rawKeyDown",
          code: resolved.code,
          key: effectiveKey,
          windowsVirtualKeyCode: resolved.keyCodeWithoutLocation,
          modifiers: currentMask,
          ...(isRepeat && { autoRepeat: true }),
          ...(hasText && {
            text: effectiveText,
            unmodifiedText: effectiveText,
          }),
          ...(resolved.location && { location: resolved.location }),
        },
        sessionId,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              source: "CdpPage",
              method: "keyboardDown",
              reason: new SelectorError({
                selector: "",
                description: `Key down failed: ${getErrorMessage(cause)}`,
              }),
            }),
        ),
      );

      // Add the key to pressedKeys after dispatching
      yield* Ref.update(state.pressedKeys, (set) => set.add(resolved.code));
    }),
);

/**
 * Dispatches a keyup event for a key.
 *
 * Used to release keys that were pressed with `keyboardDown`. If the key is
 * a modifier (Shift, Control, Alt, Meta), it removes it from the global
 * modifier mask BEFORE dispatching the event.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state (tracks modifier mask)
 * @param key - Key to release (e.g., "Shift", "a", "ArrowLeft")
 */
export const keyboardUp = Effect.fn("CdpPage.keyboardUp")(
  (conn: CdpConnection["Service"], state: PageState, key: string) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      // Resolve the key via the keyboard layout map
      const resolved = resolveKeyDescription(key);
      if (!resolved) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "keyboardUp",
          reason: new SelectorError({
            selector: "",
            description: `Unknown key: "${key}"`,
          }),
        });
      }

      // Get current modifier mask from state
      let currentMask = yield* Ref.get(state.currentModifierMask);

      // Check if Shift is in the current mask for shifted key handling
      const hasShift = (currentMask & modifierFlag.Shift) !== 0;
      const shiftedKey = hasShift ? getShiftedKey(resolved.code) : null;
      const effectiveKey = shiftedKey ?? resolved.key;

      // Check if this key is a modifier
      const isModifier = modifierKeyNames.includes(resolved.key);

      // If it's a modifier, remove it from the mask BEFORE dispatching keyup
      if (isModifier) {
        currentMask &= ~modifierFlag[resolved.key as keyof typeof modifierFlag];
        yield* Ref.set(state.currentModifierMask, currentMask);
      }

      // Dispatch keyup with current modifier mask
      // Note: for non-modifiers, use the mask as-is (other modifiers still held)
      // For modifiers, currentMask now reflects the remaining pressed keys
      yield* conn.cdp.Input.dispatchKeyEvent(
        {
          type: "keyUp",
          code: resolved.code,
          key: effectiveKey,
          windowsVirtualKeyCode: resolved.keyCodeWithoutLocation,
          modifiers: currentMask,
          ...(resolved.location && { location: resolved.location }),
        },
        sessionId,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              source: "CdpPage",
              method: "keyboardUp",
              reason: new SelectorError({
                selector: "",
                description: `Key up failed: ${getErrorMessage(cause)}`,
              }),
            }),
        ),
      );

      // Remove the key from pressedKeys after dispatching
      yield* Ref.update(state.pressedKeys, (set) => {
        const newSet = new Set(set);
        newSet.delete(resolved.code);
        return newSet;
      });
    }),
);

// ── keyboardType implementation ────────────────────────────────────────────

/**
 * Types text at the current cursor position.
 *
 * Unlike `page.type(selector, text)`, this does not focus any element.
 * It types at wherever the cursor currently is. This matches Playwright's
 * `keyboard.type(text)` behavior.
 *
 * Respects the current modifier state - if Shift is held (via keyboardDown),
 * shifted keys will be produced.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state (tracks modifier mask)
 * @param text - Text to type
 * @param options - Typing options (delay between chars)
 */
export const keyboardType = Effect.fn("CdpPage.keyboardType")(
  (conn: CdpConnection["Service"], state: PageState, text: string, options?: { delay?: number }) =>
    Effect.gen(function* () {
      const delay = options?.delay ?? 0;
      const sessionId = yield* ensureSession(state);

      const mapInteractionError = Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            source: "CdpPage",
            method: "keyboardType",
            reason: new SelectorError({
              selector: "",
              description: `Keyboard type failed: ${getErrorMessage(cause)}`,
            }),
          }),
      );

      // Get current modifier mask from state
      const currentMask = yield* Ref.get(state.currentModifierMask);
      const hasShift = (currentMask & modifierFlag.Shift) !== 0;

      // Type each character sequentially with optional delay
      yield* Effect.forEach(
        text,
        (char) =>
          Effect.gen(function* () {
            const desc = resolveKeyDescription(char);

            if (desc && desc.text && isPrintableASCII(char)) {
              // Printable ASCII character — dispatch as keyDown/keyUp with full properties
              // Check if Shift is held for shifted key handling
              const shiftedKey = hasShift ? getShiftedKey(desc.code) : null;
              const effectiveKey = shiftedKey ?? desc.key;
              const effectiveText = shiftedKey ?? desc.text;

              yield* conn.cdp.Input.dispatchKeyEvent(
                {
                  type: "keyDown",
                  key: effectiveKey,
                  code: desc.code,
                  text: effectiveText,
                  windowsVirtualKeyCode: desc.keyCodeWithoutLocation,
                  unmodifiedText: effectiveText,
                  modifiers: currentMask,
                },
                sessionId,
              ).pipe(mapInteractionError);

              yield* conn.cdp.Input.dispatchKeyEvent(
                {
                  type: "keyUp",
                  key: effectiveKey,
                  code: desc.code,
                  windowsVirtualKeyCode: desc.keyCodeWithoutLocation,
                  modifiers: currentMask,
                },
                sessionId,
              ).pipe(mapInteractionError);
            } else {
              // Non-ASCII or unmapped character — use insertText (IME-style)
              yield* conn.cdp.Input.insertText({ text: char }, sessionId).pipe(mapInteractionError);
            }

            if (delay > 0) {
              yield* sleep(delay);
            }
          }),
        { concurrency: 1 },
      );
    }),
);

// ── insertText implementation ────────────────────────────────────────────────

/**
 * Inserts text at the current cursor position without generating key events.
 *
 * Unlike `keyboardType`, this uses `Input.insertText` directly, which:
 * - Does NOT generate keydown/keyup events
 * - Only emits an `input` event
 * - Works even if keydown events are prevented
 *
 * Useful for inserting emoji, special characters, or any text that should
 * bypass normal keyboard event handling.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param text - Text to insert
 */
export const insertText = Effect.fn("CdpPage.insertText")(
  (conn: CdpConnection["Service"], state: PageState, text: string) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      yield* conn.cdp.Input.insertText({ text }, sessionId).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              source: "CdpPage",
              method: "insertText",
              reason: new SelectorError({
                selector: "",
                description: `Insert text failed: ${getErrorMessage(cause)}`,
              }),
            }),
        ),
      );
    }),
);
