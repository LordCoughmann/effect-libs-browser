# browser-cdp — Frames

`@effect-libs/browser-cdp` exposes the full frame hierarchy through the
`CdpPageService` (and the matching `CdpFrame` API for individual
frames). There are two ways to access a frame:

- **`page.frame(selector)`** — eager, returns `Option<CdpFrame>`.
  Resolves immediately to the _first_ match (or `None`).
- **`page.frameLocator(selector)`** — lazy, returns a `CdpFrameLocator`
  builder. Resolves at _action_ time and chains into iframes.

The asymmetry is the most common source of confusion — pick the right
one for the use case.

## `page.frame(selector)` — eager resolution

Returns `Effect<Option<CdpFrame>, CdpError>`. Resolves to the first
matching frame, or `None` if no frame matches.

```typescript
import { Effect, Option } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/page-with-iframe");

      // First match
      const iframe = yield* page.frame("#my-iframe");
      if (Option.isSome(iframe)) {
        const url = yield* iframe.value.url;
        const text = yield* iframe.value.evaluate(() => document.body.textContent);
      }
    }),
  );
});
```

You can also select by `{ name }` or `{ url }` instead of a CSS
selector.

## `page.frameLocator(selector)` — lazy resolution

Returns a `CdpFrameLocator` builder. The frame is **not** resolved
until you act on it (or chain `.locator(inner)`). The returned locator
is lazy and immutable.

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/page-with-iframe");

      // Resolve the iframe and chain a locator into it
      const submitButton = page.frameLocator("#login-iframe").locator("button.submit");
      yield* submitButton.click();

      // Or chain a regular locator into the frame
      yield* page.frameLocator("#login-iframe").locator("button").click();
    }),
  );
});
```

`frameLocator` is the right choice when you want to interact with
elements inside the iframe — the lazy resolution means the iframe
doesn't need to exist at locator construction time, only at action
time.

### Nested iframes

For deeper nesting, use `CdpFrameLocator.locator()` to descend into
the first iframe, then use the frame's own `locator()` for the next
level. `CdpFrameLocator` does not chain `.frameLocator(...)`; it
exposes a single `locator()` that returns a `CdpLocator` scoped to
the iframe.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    // 2-level iframe chain: page → #outer → button
    yield* page.frameLocator("#outer").locator("button.submit").click();
  });
```

For deeper nesting where the target lives in a _grandchild_ iframe,
resolve the parent frame first, then use `page.frame(...)` again to
descend.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect, Option } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    // 3-level chain: page → #outer (CdpFrame) → #inner (CdpFrame) → #deep-button
    const outer = yield* page.frame("#outer");
    if (Option.isSome(outer)) {
      // The CdpFrame doesn't directly expose a CSS lookup; use page-level
      // APIs for elements inside. To target an element in a deep iframe,
      // use a frameLocator chain at the page level or operate inside the
      // resolved frame via its evaluate().
      yield* outer.value.evaluate((doc) => {
        const deep = doc.querySelector("#deep-button");
        return deep?.textContent ?? null;
      });
    }
  });
```

## `page.frames` and `page.mainFrame` — the full hierarchy

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpFrame } from "@effect-libs/browser-cdp";

import { Console, Effect } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    yield* page.goto("https://example.com");

    // All frames (main + iframes)
    const all = yield* page.frames;
    // Main frame only
    const main = yield* page.mainFrame;

    // Walk the tree. Note: the recursive walk's outer Effect type
    // is `Effect<void, CdpError, never>` because childFrames can fail.
    const walk = (frame: CdpFrame): Effect.Effect<void, unknown, never> =>
      Effect.gen(function* () {
        const url = yield* frame.url;
        const name = yield* frame.name;
        const detached = yield* frame.isDetached;
        yield* Console.log(`${name || "(unnamed)"} ${url} detached=${detached}`);
        const children = yield* frame.childFrames;
        for (const child of children) yield* walk(child);
      });
    yield* walk(main);
  });
```

## `CdpFrame` — the per-frame API

The `CdpFrame` object has its own page-style API. Use it for
navigation, evaluation, and waiting inside a specific frame.

| Method                                      | Returns                                     | Notes                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frame.frameId`                             | `string` (property)                         | CDP frame identifier.                                                                                                                                                                                                                                                                      |
| `frame.url`                                 | `Effect<string, never, never>`              | Current URL.                                                                                                                                                                                                                                                                               |
| `frame.name`                                | `Effect<string, never, never>`              | Frame name (or empty string if unnamed).                                                                                                                                                                                                                                                   |
| `frame.isDetached`                          | `Effect<boolean, never, never>`             | Whether the frame is detached from the DOM.                                                                                                                                                                                                                                                |
| `frame.parentFrame`                         | `Effect<Option<CdpFrame>, CdpError>`        | Parent frame; `None` for the main frame.                                                                                                                                                                                                                                                   |
| `frame.childFrames`                         | `Effect<ReadonlyArray<CdpFrame>, CdpError>` | Direct children only (not the full subtree).                                                                                                                                                                                                                                               |
| `frame.content`                             | `Effect<string, CdpError>`                  | The frame's outer HTML.                                                                                                                                                                                                                                                                    |
| `frame.evaluate(fn, arg?)`                  | `Effect<T, CdpError>`                       | Run a function in the frame's context.                                                                                                                                                                                                                                                     |
| `frame.goto(url, options?)`                 | `Effect<Option<Response>, CdpError>`        | Navigate the frame. `Some(response)` for HTTP navigations, `None` for browser-internal URLs.                                                                                                                                                                                               |
| `frame.setContent(html, options?)`          | `Effect<void, CdpError>`                    | Replace the frame's HTML.                                                                                                                                                                                                                                                                  |
| `frame.waitForNavigation(options?)`         | `Effect<Option<Response>, CdpError>`        | Wait for the next navigation in this frame. `Some(response)` for cross-document navigations (response status, url, headers available); `None` for same-document navigations (pushState, replaceState, hash), `waitUntil: "commit"`, or when the response didn't arrive within the timeout. |
| `frame.waitForLoadState(state?, options?)`  | `Effect<void, CdpError>`                    | Wait for a specific load state.                                                                                                                                                                                                                                                            |
| `frame.waitForURL(url, options?)`           | `Effect<void, CdpError>`                    | Wait for the frame's URL to match.                                                                                                                                                                                                                                                         |
| `frame.waitForFunction(fn, arg?, options?)` | `Effect<T, CdpError>`                       | Wait for a JS function to return truthy.                                                                                                                                                                                                                                                   |
| `frame.waitForSelector(selector, options?)` | `Effect<void, CdpError>`                    | Wait for a selector inside the frame.                                                                                                                                                                                                                                                      |
| `frame.waitForTimeout(ms)`                  | `Effect<void, never, never>`                | Sleep in the frame context.                                                                                                                                                                                                                                                                |
| `frame.locator(selector, options?)`         | `CdpLocator`                                | Locator scoped to the frame's DOM.                                                                                                                                                                                                                                                         |
| `frame.getByRole(...)` / `getByText(...)`   | `CdpLocator`                                | All `getBy*` methods work on a frame, just like on a page.                                                                                                                                                                                                                                 |

> **`frame.frameLocator(selector)` is not supported.** Use
> `page.frameLocator(...)` instead, which chains from the page's
> current main frame. `frameLocator` is page-level because the
> resolution walks the main-frame → iframe chain.

## Frame extension methods (Phase P3)

Beyond the core frame API, `CdpFrame` exposes a full selector surface
that mirrors the Page API. These methods are CDP-Extensions — they
delegate to a frame-scoped `CdpLocator` built via
`makeFrameScopedCdpLocator`. See
[`packages/browser-cdp/src/internal/Page/FrameExtensions.ts`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src/internal/Page/FrameExtensions.ts)
for the implementation.

| Method                                                      | Returns                               | Notes                                                                                       |
| ----------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `frame.title`                                               | `Effect<string, CdpError>`            | CDP-Extension — equivalent to `frame.evaluate(() => document.title)`.                       |
| `frame.page`                                                | `Effect<CdpPageService, never>`       | CDP-Extension — returns the parent page.                                                    |
| `frame.evaluateHandle(fn, arg?)`                            | `Effect<CdpHandle, CdpError>`         | CDP-Extension — see [`handles.md`](./handles.md).                                           |
| `frame.click(selector, options?)`                           | `Effect<void, CdpError>`              | Synthetic DOM events in the iframe's main world. NOT trusted (`event.isTrusted === false`). |
| `frame.dblclick(selector, options?)`                        | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.tap(selector, options?)`                             | `Effect<void, CdpError>`              | Touch event dispatch.                                                                       |
| `frame.hover(selector, options?)`                           | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.fill(selector, value, options?)`                     | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.focus(selector, options?)`                           | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.blur(selector, options?)`                            | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.type(selector, text, options?)`                      | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.press(selector, key, options?)`                      | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.check(selector, options?)`                           | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.uncheck(selector, options?)`                         | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.setChecked(selector, checked, options?)`             | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.selectOption(selector, values, options?)`            | `Effect<readonly string[], CdpError>` | —                                                                                           |
| `frame.setInputFiles(selector, files, options?)`            | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.dragAndDrop(source, target, options?)`               | `Effect<void, CdpError>`              | Synthetic `dragstart` / `drop` events. Not HTML5 dnd emulation.                             |
| `frame.dispatchEvent(selector, type, eventInit?, options?)` | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.textContent(selector, options?)`                     | `Effect<Option<string>, CdpError>`    | —                                                                                           |
| `frame.innerText(selector, options?)`                       | `Effect<Option<string>, CdpError>`    | —                                                                                           |
| `frame.innerHTML(selector, options?)`                       | `Effect<Option<string>, CdpError>`    | —                                                                                           |
| `frame.getAttribute(selector, name, options?)`              | `Effect<Option<string>, CdpError>`    | —                                                                                           |
| `frame.inputValue(selector, options?)`                      | `Effect<string, CdpError>`            | —                                                                                           |
| `frame.isChecked(selector, options?)`                       | `Effect<boolean, CdpError>`           | —                                                                                           |
| `frame.isDisabled(selector, options?)`                      | `Effect<boolean, CdpError>`           | —                                                                                           |
| `frame.isEditable(selector, options?)`                      | `Effect<boolean, CdpError>`           | —                                                                                           |
| `frame.isEnabled(selector, options?)`                       | `Effect<boolean, CdpError>`           | —                                                                                           |
| `frame.isHidden(selector, options?)`                        | `Effect<boolean, CdpError>`           | —                                                                                           |
| `frame.isVisible(selector, options?)`                       | `Effect<boolean, CdpError>`           | —                                                                                           |
| `frame.locator(selector, options?)`                         | `CdpLocator`                          | Same as `frame.locator` in the core API — listed here for the full surface.                 |
| `frame.getByRole(role, options?)`                           | `CdpLocator`                          | —                                                                                           |
| `frame.getByText(text, options?)`                           | `CdpLocator`                          | —                                                                                           |
| `frame.getByLabel(text, options?)`                          | `CdpLocator`                          | —                                                                                           |
| `frame.getByTestId(testId)`                                 | `CdpLocator`                          | —                                                                                           |
| `frame.getByPlaceholder(text, options?)`                    | `CdpLocator`                          | —                                                                                           |
| `frame.getByAltText(text, options?)`                        | `CdpLocator`                          | —                                                                                           |
| `frame.getByTitle(text)`                                    | `CdpLocator`                          | —                                                                                           |
| `frame.frameLocator(selector)`                              | `CdpFrameLocator`                     | CDP-Extension — page-level iframe traversal. Mirrors `page.frameLocator`.                   |
| `frame.setContent(html, options?)`                          | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.addScriptTag(options)`                               | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.addStyleTag(options)`                                | `Effect<void, CdpError>`              | —                                                                                           |
| `frame.$eval(selector, fn, arg?)`                           | `Effect<T, CdpError>`                 | First match only — auto-waits. See [`evaluate.md`](./evaluate.md).                          |
| `frame.$$eval(selector, fn, arg?)`                          | `Effect<T, CdpError>`                 | All matches — no auto-wait.                                                                 |

**Trade-off:** these methods dispatch **synthetic DOM events**
(`el.click()`, `el.value = ...`) inside the iframe's main world. They
are NOT trusted (`event.isTrusted === false`). Some sites detect this
and reject the events — coordinate-translation trusted events are
deferred. For sites that require trusted input, use `@effect-libs/browser-playwright`.

## Shadow DOM piercing

Locators in `@effect-libs/browser-cdp` **pierce open shadow roots by default**
(matches upstream Playwright). The implementation uses
`DOM.getDocument({ pierce: true })` for `waitForSelector` and locator
resolution. To disable:

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    // Per-call — wait for the element, then click it
    yield* page.waitForSelector("button", { pierceShadowDOM: false });
    yield* page.locator("button").click();
  });
```

## Frame events

Three streams fire when the frame tree changes:

- `onFramenavigated` — a frame completed a navigation (fires for the
  main frame and each iframe).
- `onFramedetached` — a frame was removed from the DOM.
- `onFramestoppedloading` — a frame stopped loading (lifecycle event).

See [browser-cdp — Event Streams](./streams.md) for the eager-subscription
pattern.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Console, Effect, Fiber, Stream } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    const stream = yield* page.onFramenavigated;
    // Log every frame navigation
    const fiber = yield* Stream.runForEach(stream, (frame) =>
      Effect.gen(function* () {
        const url = yield* frame.url;
        return Console.log(`navigated: ${url}`);
      }),
    ).pipe(Effect.forkChild);
    yield* Fiber.join(fiber);
  });
```

## See also

- [browser-cdp — Locators](./locators.md) — for the Locator API that frames
  inherit
- [browser-cdp — Event Streams](./streams.md) — for the frame-event streams
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations
  from upstream Playwright
- [Navigation & Concurrency Reference](../../contributing/cdp/navigation-concurrency.md) —
  how frame navigation is tracked internally
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
