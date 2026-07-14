# browser-cdp — Context API

`@effect-libs/browser-cdp`'s `BrowserContext` equivalent. The `CdpContextHandle` lives
on every scope bundle (`CdpSessionScope`, `CdpConnectionScope`,
`CdpContextScope`) and provides shared state for all pages in the context:
cookies, emulation overrides (user agent, geolocation, offline state),
permissions, storage state, and timeouts.

This is the most important non-page-level surface in `@effect-libs/browser-cdp`. Most
of it is **not** on the `CdpPageService`; it's on the context handle that
lives alongside the page. Concretely:

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ context, page }) =>
    Effect.gen(function* () {
      // Apply emulation to every page in the context
      yield* context.setUserAgent("Mozilla/5.0 (...)");
      yield* context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });

      // Open more pages in the same context — they share cookies + emulation
      yield* page.goto("https://example.com");

      // Snapshot state for later replay
      const state = yield* context.storageState();
    }),
  );
});
```

## Why context-level?

Context-level methods apply to **every page in the context**, not just the
default page. A new page opened via `connection.withPage(...)` or
`context.withPage(...)` inherits the same cookies, user-agent override,
geolocation, and offline state as the default page.

Page-level mirrors exist for the methods that make sense to set on a single
page (`page.setExtraHTTPHeaders`, `page.cookies`, `page.addCookies`,
`page.clearCookies`) — but the _shared_ state (emulation, storage state,
permissions, default timeouts) lives on the context.

## Methods

| Method                                     | Returns           | Notes                                                                              |
| ------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------- |
| `withPage(fn)`                             | `Effect<A, E, R>` | Open another page in this context (shared cookies, isolation from other contexts). |
| `cookies(urls?)`                           | `CdpCookie[]`     | All cookies; optionally filtered to one or more URLs.                              |
| `addCookies(cookies)`                      | `void`            | Add cookies to the context.                                                        |
| `clearCookies({ name?, domain?, path? })`  | `void`            | Clear all cookies, or filter by `name` / `domain` / `path`.                        |
| `setUserAgent(ua, { userAgentMetadata? })` | `void`            | Override `User-Agent` (and optionally `Sec-CH-UA-*` Client Hints).                 |
| `setGeolocation(geo \| undefined)`         | `void`            | Override geolocation; pass `undefined` to clear.                                   |
| `setOffline(offline)`                      | `void`            | Toggle the network offline state.                                                  |
| `grantPermissions(perms, { origin? })`     | `void`            | Auto-grant Web Platform permissions for all (or one) origin.                       |
| `clearPermissions()`                       | `void`            | Reset all permission management (back to `"prompt"`).                              |
| `storageState()`                           | `StorageState`    | Snapshot cookies + per-origin `localStorage` to JSON.                              |
| `addStorageState(state)`                   | `void`            | Restore cookies + `localStorage` from a `StorageState`.                            |
| `setDefaultTimeout(ms?)`                   | `void`            | Default timeout for all page operations.                                           |
| `setDefaultNavigationTimeout(ms?)`         | `void`            | Default timeout for navigation operations.                                         |

For the page-level mirrors (`page.cookies`, `page.addCookies`,
`page.clearCookies`, `page.setExtraHTTPHeaders`), see
See [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md).

## Examples

### Cookies

<!-- verify:stubs -->
<!-- verify:stubs:declare const context: import("@effect-libs/browser-cdp").CdpContextHandle -->

```typescript
import { Effect } from "effect";

const example = (context: import("@effect-libs/browser-cdp").CdpContextHandle) =>
  Effect.gen(function* () {
    // Read
    const all = yield* context.cookies();
    const forOrigin = yield* context.cookies("https://example.com");

    // Add
    yield* context.addCookies([
      { name: "session", value: "abc123", domain: ".example.com", path: "/" },
    ]);

    // Clear (all, or filtered)
    yield* context.clearCookies();
    yield* context.clearCookies({ name: "session" });
    yield* context.clearCookies({ domain: ".example.com" });
  });
```

### User agent

Override the user agent string. Optionally send matching
`Sec-CH-UA-*` Client Hints by providing `userAgentMetadata`.

<!-- verify:stubs -->
<!-- verify:stubs:declare const context: import("@effect-libs/browser-cdp").CdpContextHandle -->

```typescript
import { Effect } from "effect";

const example = (context: import("@effect-libs/browser-cdp").CdpContextHandle) =>
  Effect.gen(function* () {
    // String only
    yield* context.setUserAgent("Mozilla/5.0 (...)");

    // With Client Hints
    yield* context.setUserAgent("Mozilla/5.0 (...)", {
      userAgentMetadata: {
        brands: [{ brand: "My Browser", version: "1.0" }],
        fullVersionList: [{ brand: "My Browser", version: "1.0.0" }],
        platform: "Linux",
        platformVersion: "5.0",
        architecture: "x86",
        model: "",
        mobile: false,
        bitness: "64",
        wow64: false,
      },
    });
  });
```

The override applies to every page in the context, including any subsequent
pages opened via `context.withPage(...)` or `connection.withPage(...)`.

### Geolocation

Override the geolocation. After this, `navigator.geolocation.getCurrentPosition`
on every page in the context resolves with the given coordinates. Pass
`undefined` to clear the override.

<!-- verify:stubs -->
<!-- verify:stubs:declare const context: import("@effect-libs/browser-cdp").CdpContextHandle -->

```typescript
import { Effect } from "effect";

const example = (context: import("@effect-libs/browser-cdp").CdpContextHandle) =>
  Effect.gen(function* () {
    // Set
    yield* context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });

    // With accuracy (in meters)
    yield* context.setGeolocation({ latitude: 37.7749, longitude: -122.4194, accuracy: 50 });

    // Clear
    yield* context.setGeolocation(undefined);
  });
```

`undefined` mirrors upstream Playwright's
`BrowserContext.setGeolocation(undefined)` semantics: the browser reports
position as unavailable from `navigator.geolocation`.

### Offline

Toggle the network offline state. When `true`, in-flight and new requests
on every page in the context fail with `net::ERR_INTERNET_DISCONNECTED`.

<!-- verify:stubs -->
<!-- verify:stubs:declare const context: import("@effect-libs/browser-cdp").CdpContextHandle -->

```typescript
import { Effect } from "effect";

const example = (context: import("@effect-libs/browser-cdp").CdpContextHandle) =>
  Effect.gen(function* () {
    yield* context.setOffline(true);
    // ... any in-flight or new request will fail ...
    yield* context.setOffline(false);
  });
```

### Permissions

Auto-grant Web Platform permission names for all (or one) origin. After
`grantPermissions`, calls like `navigator.geolocation.getCurrentPosition`
no longer wait for a user prompt.

<!-- verify:stubs -->
<!-- verify:stubs:declare const context: import("@effect-libs/browser-cdp").CdpContextHandle -->

```typescript
import { Effect } from "effect";

const example = (context: import("@effect-libs/browser-cdp").CdpContextHandle) =>
  Effect.gen(function* () {
    // Grant for all origins in the context
    yield* context.grantPermissions(["geolocation", "notifications", "clipboard-read"]);

    // Grant for a specific origin
    yield* context.grantPermissions(["geolocation"], { origin: "https://example.com" });

    // Reset all permissions (back to "prompt")
    yield* context.clearPermissions();
  });
```

The names are the Web Platform permission names from `navigator.permissions`
(e.g. `"geolocation"`, `"notifications"`, `"clipboard-read"`,
`"clipboard-write"`, `"camera"`, `"microphone"`, `"midi"`,
`"payment-handler"`, `"push"`, `"screen-wake-lock"`, `"local-network-access"`,
`"window-management"`, `"storage-access"`). The mapping to CDP
`PermissionType` is handled internally.

### Storage state round-trip

`context.storageState()` snapshots the context's persisted state — cookies
and per-origin `localStorage` — for serialization to disk. Restore with
`context.addStorageState(state)`.

<!-- verify:stubs -->
<!-- verify:stubs:declare const context: import("@effect-libs/browser-cdp").CdpContextHandle -->

```typescript
import { Effect } from "effect";

const example = (context: import("@effect-libs/browser-cdp").CdpContextHandle) =>
  Effect.gen(function* () {
    // Save
    const state = yield* context.storageState();
    yield* Effect.sync(() => require("fs").writeFileSync("state.json", JSON.stringify(state)));

    // Restore (in a new context, e.g. on a fresh worker invocation)
    const loaded = JSON.parse(require("fs").readFileSync("state.json", "utf8"));
    yield* context.addStorageState(loaded);
  });
```

Notes:

- `sessionStorage` is intentionally **not** included in the snapshot.
  Upstream Playwright also excludes it — `sessionStorage` is per-tab and not
  persistable across browser restarts.
- Cookie `expires` / `session` flags may be rewritten by the browser
  during round-trip, but the visible behavior is preserved.

### Timeouts

The default timeouts apply to every page in the context. Pass `undefined`
to clear.

<!-- verify:stubs -->
<!-- verify:stubs:declare const context: import("@effect-libs/browser-cdp").CdpContextHandle -->

```typescript
import { Effect } from "effect";

const example = (context: import("@effect-libs/browser-cdp").CdpContextHandle) =>
  Effect.gen(function* () {
    yield* context.setDefaultTimeout(15_000);
    yield* context.setDefaultNavigationTimeout(60_000);

    // Clear
    yield* context.setDefaultTimeout(undefined);
    yield* context.setDefaultNavigationTimeout(undefined);
  });
```

## Multi-page inside a context

`context.withPage(fn)` opens a new page in the **same** context — it shares
cookies, storage, and emulation with the default page. Use this for
multi-page workflows where pages need the same site state.

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ context, page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/login");
      yield* page.fill("#email", "user@example.com");
      yield* page.click("button.login");

      // Open another tab in the same context — same login state
      yield* context.withPage((page2) =>
        Effect.gen(function* () {
          yield* page2.goto("https://example.com/dashboard");
        }),
      );
    }),
  );
});
```

For **isolated** tabs (no shared cookies / storage), use
`connection.withContext(...)` instead.

## See also

- [browser-cdp — Locators](./locators.md) — for the page-level operations
  applied to a single element
- [browser-cdp — Network](./network.md) — for `route`, `routeWebSocket`, and
  the `page.fetch` / `page.httpClient` extensions
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations
  from upstream Playwright
- [Managing Resources](../../concepts/resources.md) — `withContext`
  vs `withPage` decision tree
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
