# browser-cdp — Locators

The Locator API in `@effect-libs/browser-cdp` is a Playwright-compatible wrapper
around a CSS selector with auto-wait and actionability checks. Every
operation (`click`, `fill`, `textContent`, `isVisible`, ...) returns an
`Effect` and applies the same actionability rules upstream Playwright uses.

The shape is the same as [`@effect-libs/browser-playwright`'s Locator][pw-locator];
the implementation is a fresh `@effect-libs/browser-cdp`-native `Locator.ts` (803 LOC). The
differences from upstream Playwright's underlying Locator are minor and noted
below.

[pw-locator]: https://playwright.dev/docs/api/class-locator

## Top-level entry points

Every page exposes the same six top-level locators:

| Method                                  | Returns      | Notes                                                                            |
| --------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| `page.locator(selector, options?)`      | `CdpLocator` | A CSS selector. Resolves lazily.                                                 |
| `page.getByRole(role, options?)`        | `CdpLocator` | ARIA role + name.                                                                |
| `page.getByText(text, options?)`        | `CdpLocator` | String or `RegExp`. `exact`, `case-sensitive` options.                           |
| `page.getByLabel(text, options?)`       | `CdpLocator` | Associated `<label>` text.                                                       |
| `page.getByTestId(testId)`              | `CdpLocator` | `data-testid` attribute (or upstream Playwright's `selectors.testId` attribute). |
| `page.getByPlaceholder(text, options?)` | `CdpLocator` | `placeholder` attribute.                                                         |
| `page.getByAltText(text, options?)`     | `CdpLocator` | `alt` attribute.                                                                 |
| `page.getByTitle(text, options?)`       | `CdpLocator` | `title` attribute or `title` child.                                              |

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/login");

      // CSS
      yield* page.locator("#email").fill("user@example.com");
      yield* page.locator("button.submit").click();

      // Role + name (best for accessible interactions)
      yield* page.getByRole("button", { name: "Sign in" }).click();

      // Test ID
      yield* page.getByTestId("confirm-button").click();

      // Label
      yield* page.getByLabel("Email address").fill("user@example.com");
    }),
  );
});
```

## Chaining and composition

Locators are immutable; every chain method returns a new `CdpLocator`.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpPageService } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    // Filter to refine
    yield* page.getByRole("listitem").filter({ hasText: "Product" }).first.click();

    // nth(0) is the first match, nth(1) the second, etc.
    yield* page.locator(".row").nth(2).click();

    // Chain to descend into a subtree
    yield* page.locator(".card").getByRole("button", { name: "Buy" }).click();
  });
```

| Method                          | Returns      | Notes                                                           |
| ------------------------------- | ------------ | --------------------------------------------------------------- |
| `locator.filter({ hasText })`   | `CdpLocator` | Match only elements containing the text / RegExp.               |
| `locator.nth(n)`                | `CdpLocator` | The `n`-th match (0-indexed).                                   |
| `locator.first` (getter)        | `CdpLocator` | Lazy getter: equivalent to `nth(0)`.                            |
| `locator.last` (getter)         | `CdpLocator` | Lazy getter: equivalent to `nth(-1)`.                           |
| `locator.and(other)`            | `CdpLocator` | Both selectors must match (used internally for chained scopes). |
| `locator.or(other)`             | `CdpLocator` | Either selector matches.                                        |
| `locator.locator(inner)`        | `CdpLocator` | Descend into a subtree.                                         |
| `locator.getByRole(...)`        | `CdpLocator` | Same as page-level, but scoped.                                 |
| `locator.getByText(...)`        | `CdpLocator` | Same as page-level, but scoped.                                 |
| `locator.getByLabel(...)`       | `CdpLocator` | Same as page-level, but scoped.                                 |
| `locator.getByTestId(...)`      | `CdpLocator` | Same as page-level, but scoped.                                 |
| `locator.getByPlaceholder(...)` | `CdpLocator` | Same as page-level, but scoped.                                 |
| `locator.getByAltText(...)`     | `CdpLocator` | Same as page-level, but scoped.                                 |
| `locator.getByTitle(...)`       | `CdpLocator` | Same as page-level, but scoped.                                 |

> **`first` and `last` are getters, not methods** — they're implemented
> lazily to avoid the infinite-recursion problem. The same applies to
> `@effect-libs/browser-playwright`.

## Actions

The CDP Locator supports the full upstream Playwright action surface. Each
action returns an `Effect` that auto-waits for the element to be ready.

<!-- verify:stubs -->
<!-- verify:stubs:declare const locator: import("@effect-libs/browser-cdp").CdpLocator -->

```typescript
import type { CdpLocator } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (locator: CdpLocator) =>
  Effect.gen(function* () {
    // Click + double-click + hover
    yield* locator.click();
    yield* locator.dblclick();
    yield* locator.hover();

    // Fill + type
    yield* locator.fill("hello world");
    yield* locator.type("typed character by character");
    yield* locator.pressSequentially("typed character by character"); // alias for type()
    yield* locator.clear(); // alias for fill("")

    // Check / uncheck (checkboxes + radios)
    yield* locator.check();
    yield* locator.uncheck();
    yield* locator.setChecked(true);

    // Select (dropdowns)
    yield* locator.selectOption("value-1");

    // File upload
    yield* locator.setInputFiles(["/path/to/file.pdf"]);

    // Focus / blur
    yield* locator.focus();
    yield* locator.blur();

    // Press a key while the element is focused
    yield* locator.press("Enter");

    // Dispatch a DOM event
    yield* locator.dispatchEvent("click", { bubbles: true });

    // Scroll into view (idempotent — no-op if already in view)
    yield* locator.scrollIntoViewIfNeeded();

    // Tap (touch)
    yield* locator.tap();
  });
```

> **Page-level alternatives.** `page.dragAndDrop(source, target)` is
> the recommended entry point for drag-and-drop — synthetic events
> either way, but the Page-level form covers the common case. See
> [`network.md`](./network.md) for `page.route` / `unroute` (network
> interception is page-level, not locator-level).

## Queries

Read state from the element without acting on it.

<!-- verify:stubs -->
<!-- verify:stubs:declare const locator: import("@effect-libs/browser-cdp").CdpLocator -->

```typescript
import type { CdpLocator } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (locator: CdpLocator) =>
  Effect.gen(function* () {
    // Text content (each is a method that takes optional timeout)
    const text = yield* locator.textContent();
    const inner = yield* locator.innerText();
    const html = yield* locator.innerHTML();

    // Attribute / value
    const href = yield* locator.getAttribute("href");
    const value = yield* locator.inputValue();

    // Count + multi-element
    const count = yield* locator.count();
    const all = yield* locator.all(); // ReadonlyArray<CdpLocator>
    const texts = yield* locator.allTextContents();
    const inners = yield* locator.allInnerTexts();

    // Bounding box — returns null for hidden / missing / strict-mode multi-match
    const box = yield* locator.boundingBox();

    // Element-scoped screenshot
    const png = yield* locator.screenshot();

    // Evaluate / evaluateHandle / evaluateAll — see evaluate.md
    const tagLen = yield* locator.evaluate<number, void>((el) => el.tagName.length);
    const allTags = yield* locator.evaluateAll<number, void>((els) => els.length);
    const handle = yield* locator.evaluateHandle<Element>((el) => el);

    // Description for debug output (synchronous, not Effect)
    const desc = locator.description(); // string | null
    const str = locator.toString(); // Playwright-style format

    // Resolve to the parent page (synchronous)
    const parentPage = locator.page();

    // Resolve to the iframe content frame (synchronous, returns a builder)
    const fl = locator.contentFrame();

    // Select text in input/textarea
    yield* locator.selectText();
  });
```

> **`boundingBox` strict-mode.** For an un-indexed locator matching
> multiple elements, `boundingBox()` returns `null` (mirrors upstream Playwright
> strict-mode). Indexed locators (`.first` / `.nth(0)` / `.last`) target
> a specific element and return its box.

## Inspection helpers

The locator has a few non-Effect helpers for debugging and chaining.
Unlike action and query methods, these return plain values (no
`yield*`):

| Helper                   | Returns             | Notes                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locator.selector`       | `string` (property) | The composed selector string for debugging / inspection.                                                                                                                                                                                                                                                                |
| `locator.description()`  | `string \| null`    | The description set via `.describe(text)`, or `null`.                                                                                                                                                                                                                                                                   |
| `locator.toString()`     | `string`            | Playwright-style format. If a description is set, returns it directly (`toString() === description()` when described). Otherwise returns `locator('selector')` for CSS, or `getByRole('button', ...)` for `getBy*` calls.                                                                                               |
| `locator.page()`         | `CdpPageService`    | The page this locator is bound to. Useful when a locator is passed around and you need to navigate the parent page.                                                                                                                                                                                                     |
| `locator.contentFrame()` | `CdpFrameLocator`   | Returns a `CdpFrameLocator` for the iframe matched by this locator (mirrors upstream Playwright's `Locator.contentFrame()`). The returned FrameLocator chains `.locator(inner)` to scope further queries to the iframe's content frame. Errors when the locator resolves to zero or more than one iframe (strict mode). |

## State checks

`is*` checks return `Effect<boolean, CdpError>`. They're useful for
assertions and conditional flows.

<!-- verify:stubs -->
<!-- verify:stubs:declare const locator: import("@effect-libs/browser-cdp").CdpLocator -->

```typescript
import type { CdpLocator } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (locator: CdpLocator) =>
  Effect.gen(function* () {
    const visible = yield* locator.isVisible();
    const hidden = yield* locator.isHidden();
    const enabled = yield* locator.isEnabled();
    const disabled = yield* locator.isDisabled();
    const editable = yield* locator.isEditable();
    const checked = yield* locator.isChecked();
  });
```

## Auto-wait and actionability

Every action auto-waits for the element to be **attached**, **visible**,
**stable**, and **receives events** before performing the action. The
wait respects the page's `setDefaultTimeout` (or the per-action
`timeout` option).

If the actionability check fails, the action fails with
`CdpError` reason `SelectorError` (or `PageTimeoutError` if it timed out
waiting to satisfy the check). The `SelectorError` includes the failing
selector and a description of which check failed.

## Actionability gotchas

- **Hidden elements** — clicking a `display: none` element fails. Use
  `force: true` to skip the visibility check (or use `page.evaluate` to
  manipulate the element directly).
- **Animations** — by default, the click waits for animations to
  finish. Pass `force: true` to skip.
- **Shadow DOM** — `locator(selector)` pierces open shadow roots by
  default (matching upstream Playwright). Set `pierceShadowDOM: false` to
  disable.

## Multi-frame locators

For elements inside iframes, use `page.frameLocator(...)` instead of
`page.locator(...)`. See [browser-cdp — Frames](./frames.md) for the
asymmetry between `page.frame` and `page.frameLocator`.

## See also

- [browser-cdp — Frames](./frames.md) — `page.frame`, `page.frameLocator`,
  `CdpFrame.locator`
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations
  from upstream Playwright
- [Playwright Locator reference](https://playwright.dev/docs/api/class-locator) —
  the upstream Playwright Locator API (`@effect-libs/browser-cdp`'s Locator mirrors this)
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
