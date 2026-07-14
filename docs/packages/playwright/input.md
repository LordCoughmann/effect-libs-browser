# browser-playwright — Input Devices

The `@effect-libs/browser-playwright` module wraps three input devices — keyboard, mouse, and
touchscreen — into Effect-friendly APIs. Each is reachable as a
page-level namespace (`page.keyboard`, `page.mouse`, `page.touchscreen`)
and returns Effects (or void for synchronous setters).

The wrappers are thin: every method delegates to upstream
`@cloudflare/playwright` and wraps the result in `Effect.tryPromise` with
a typed `PlaywrightError` (a `OperationError` reason). There is no
additional Effect-side validation — the upstream behavior is the wrapper's
behavior.

> **Note:** unlike the page wrapper, the input-device methods do **not**
> support `AbortSignal`. The `@cloudflare/playwright` Keyboard / Mouse /
> Touchscreen APIs do not accept a signal, so Effect cancellation does
> not interrupt an in-flight operation. If you need cancellation,
> structure the surrounding Effect with a timeout
> (`Effect.timeout(...)`) instead.

## Keyboard

The `page.keyboard` namespace mirrors upstream Playwright's
[`Keyboard`][pw-keyboard] API.

[pw-keyboard]: https://playwright.dev/docs/api/class-keyboard

### Methods

| Method                          | Returns                         | Notes                                                                                                                                 |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `keyboard.down(key)`            | `Effect<void, PlaywrightError>` | Press a key down without releasing. `key` is a `USKeyboardLayout` value or a single character (e.g. `"a"`, `"Shift"`, `"ArrowLeft"`). |
| `keyboard.up(key)`              | `Effect<void, PlaywrightError>` | Release a previously-held key.                                                                                                        |
| `keyboard.press(key, options?)` | `Effect<void, PlaywrightError>` | Press and release. `options.delay` (ms) inserts a delay between down and up.                                                          |
| `keyboard.type(text, options?)` | `Effect<void, PlaywrightError>` | Type a string. `options.delay` (ms) inserts a delay between keystrokes.                                                               |
| `keyboard.insertText(text)`     | `Effect<void, PlaywrightError>` | Insert text without firing key events (no `keydown` / `keyup`). Useful for inputs that listen for `input` events but not key events.  |

### Example

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-playwright").PlaywrightPage -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-playwright").PlaywrightPage) =>
  Effect.gen(function* () {
    // Focus the search input first
    yield* page.click("input[name=q]");

    // Type a query with a 50ms delay between keystrokes
    yield* page.keyboard.type("cloudflare workers", { delay: 50 });

    // Submit
    yield* page.keyboard.press("Enter");
  });
```

> **Tip:** for most form-fill workflows, prefer
> `page.fill(selector, value)` over `page.keyboard.type(...)`. `fill`
> uses the browser's native input setter (no per-key event firing) and
> respects the input's actual value type. Reserve `keyboard.type` for
> cases that need per-key event semantics (autocompletes, key-driven
> shortcuts).

## Mouse

The `page.mouse` namespace mirrors upstream Playwright's
[`Mouse`][pw-mouse] API.

[pw-mouse]: https://playwright.dev/docs/api/class-mouse

### Methods

| Method                           | Returns                         | Notes                                                                                                                     |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `mouse.click(x, y, options?)`    | `Effect<void, PlaywrightError>` | Click at `(x, y)`. `options.button` (default `"left"`), `options.clickCount` (default 1), `options.delay` (ms before up). |
| `mouse.dblclick(x, y, options?)` | `Effect<void, PlaywrightError>` | Double-click at `(x, y)`. `options.button` (default `"left"`), `options.delay`.                                           |
| `mouse.down(options?)`           | `Effect<void, PlaywrightError>` | Press a mouse button without releasing. `options.button` (default `"left"`), `options.clickCount`.                        |
| `mouse.up(options?)`             | `Effect<void, PlaywrightError>` | Release a previously-held button. `options.button` (default `"left"`), `options.clickCount`.                              |
| `mouse.move(x, y, options?)`     | `Effect<void, PlaywrightError>` | Move the mouse to `(x, y)`. `options.steps` (default 1) interpolates intermediate moves.                                  |
| `mouse.wheel(deltaX, deltaY)`    | `Effect<void, PlaywrightError>` | Scroll by `(deltaX, deltaY)`.                                                                                             |

### Example

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-playwright").PlaywrightPage -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-playwright").PlaywrightPage) =>
  Effect.gen(function* () {
    // Drag from (100, 200) to (300, 400) in 20 intermediate steps
    yield* page.mouse.move(100, 200);
    yield* page.mouse.down();
    yield* page.mouse.move(300, 400, { steps: 20 });
    yield* page.mouse.up();

    // Right-click at (200, 200)
    yield* page.mouse.click(200, 200, { button: "right" });

    // Scroll down by 500px
    yield* page.mouse.wheel(0, 500);
  });
```

Coordinates are in CSS pixels relative to the page's viewport, not the
page's full document — to scroll first, use `page.evaluate(() => window.scrollTo(...))`
or click on a scrollable element.

> **Tip:** for most drag workflows, prefer
> `page.dragAndDrop(source, target)` over manual `mouse.down` /
> `mouse.move` / `mouse.up` sequences. `dragAndDrop` does the
> actionability checks and uses Playwright's optimized drag primitives.

## Touchscreen

The `page.touchscreen` namespace mirrors upstream Playwright's
[`Touchscreen`][pw-touchscreen] API. It has a single method:

[pw-touchscreen]: https://playwright.dev/docs/api/class-touchscreen

### Methods

| Method                  | Returns                         | Notes            |
| ----------------------- | ------------------------------- | ---------------- |
| `touchscreen.tap(x, y)` | `Effect<void, PlaywrightError>` | Tap at `(x, y)`. |

### Example

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-playwright").PlaywrightPage -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-playwright").PlaywrightPage) =>
  Effect.gen(function* () {
    yield* page.goto("https://example.com/mobile-layout");
    yield* page.touchscreen.tap(200, 400);
  });
```

> **Note:** Chromium's CDP has a single touchscreen method (`Input.dispatchTouchEvent`),
> so the wrapper has nothing else to expose. For swipe / pinch gestures,
> use `page.evaluate(...)` to dispatch synthetic touch events directly,
> or fall back to `page.mouse` (the browser emulates mouse events from
> touch on desktop).

## Choosing the right input

Most workflows don't need to touch these namespaces directly — the
high-level page methods (`page.click`, `page.fill`, `page.press`,
`page.dragAndDrop`, `page.tap`) wrap them with auto-waiting,
actionability checks, and signal-based cancellation. Reach for the input
namespaces when:

- You need fine-grained control over a sequence (press a key, move
  without releasing, then release later)
- The high-level methods don't model your workflow (e.g. drawing on a
  canvas)
- You're reproducing recorded user interactions (Playwright Trace
  recordings capture raw input events)

## See also

- [`@effect-libs/browser-playwright` module](./index.md) — the module landing page
- [Playwright — Added APIs](./added-apis.md) —
  for `page.fetch` / `page.httpClient`
- [Playwright — Errors](./errors.md) — for the typed error
  hierarchy used by every method on these namespaces
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src) — full API in JSDoc
