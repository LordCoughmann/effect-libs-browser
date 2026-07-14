# Patch checklist

When syncing to a new upstream `@cloudflare/playwright@X.Y.Z`, the
`scripts/sync-upstream.sh` script replaces the vendored files with the new
upstream tarball contents. Then these four edits must be re-applied on
top, in order. Each entry below includes:

- **File** — what to edit
- **Why** — short rationale (also documented in the fork README)
- **What** — the exact code to add or remove
- **Verify** — a one-line `grep` / `node -e` command that returns the
  expected outcome if the patch applied correctly

The diffs below are against `@cloudflare/playwright@1.3.0`. The exact
line numbers will shift on every upstream release — match the code
patterns, not the line numbers.

## 1. Lazy `cloudflare:workers` import

**File:** `lib/index.js`

**Why:** Upstream imports `env` from `cloudflare:workers` at the top of
the module, which crashes on import outside Cloudflare Workers (Node.js,
Deno, Bun). Resolving it lazily via `createRequire` lets the module load
in any runtime and falls back to `{}` when `cloudflare:workers` is not
available. Load-bearing — without this the package cannot be imported at
all outside Workers.

**What:**

Remove the line:

```js
import { env } from "cloudflare:workers";
```

Add this block immediately after the other top-level imports
(after `import { version } from './playwright-cloudflare/package.json.js';`):

```js
// Resolve cloudflare:workers env lazily so the module can load in
// non-Worker runtimes (Node.js, Deno, Bun). Uses createRequire for
// ESM compliance. Falls back to empty object when not in Workers.
let _env = null;
const getEnv = () => {
  if (_env === null) {
    try {
      const { createRequire } = require('node:module');
      const cjsRequire = createRequire(import.meta.url);
      _env = cjsRequire('cloudflare:workers').env ?? {};
    } catch {
      _env = {};
    }
  }
  return _env;
};
```

Then, in **two functions only** — `endpointURLString(binding, options)`
and `getBrowserBinding(endpoint)` — add `const env = getEnv();` as the
first line of the function body (immediately after the `{`):

```js
function endpointURLString(binding, options) {
  const env = getEnv();
  // ...rest unchanged
}

function getBrowserBinding(endpoint) {
  const env = getEnv();
  // ...rest unchanged
}
```

Leave every other reference to `env.*` unchanged — they now resolve to
the local `const env` instead of the removed top-level import.

**Verify:**

```sh
# Should print 0 (only the lazy getter itself contains the string).
grep -c '"cloudflare:workers"' lib/index.js
# Should print exactly 2 (one per patched function).
grep -c 'const env = getEnv();' lib/index.js
```

If upstream removed `cloudflare:workers` entirely, this patch is no longer
needed — drop it from this checklist.

---

## 2. External CDP support

**File:** `lib/index.js`

**Why:** Upstream's `connectOverCDP()` only handles Cloudflare's internal
browser-binding endpoints. Detect `ws://` / `wss://` URLs (Steel,
Browserbase, local Chrome, anything) and connect via a standard
WebSocket instead, bypassing the browser-binding machinery.

**What:**

Find this line (inside the body of
`playwright.chromium.connectOverCDP = (endpointURLOrOptions) => { ... }`):

```js
  const wsUrl = new URL(wsEndpoint);
  if (!wsUrl.searchParams.has("persistent"))
    wsUrl.searchParams.set("persistent", "true");
```

Insert this block **immediately before** it:

```js
  // Support external WebSocket endpoints (Steel, Browserbase, local browser)
  // These bypass Cloudflare browser binding entirely
  if (wsEndpoint.startsWith("ws://") || wsEndpoint.startsWith("wss://")) {
    return connectToExternalWebSocket(wsEndpoint);
  }
```

Then add this helper function near the other top-level helpers in the
same file (a good spot is right after the existing `connectDevtools`
function):

```js
// Connect to external CDP endpoint via standard WebSocket (no browser binding needed)
async function connectToExternalWebSocket(wsEndpoint) {
  resetMonotonicTime();
  const webSocket = new WebSocket(wsEndpoint);
  await new Promise((resolve, reject) => {
    webSocket.addEventListener("open", () => resolve());
    webSocket.addEventListener("error", (error) => reject(error));
  });
  const sessionId = new URL(wsEndpoint).searchParams.get("browser_session") ?? "";
  const transport = new WebSocketTransport(webSocket, sessionId);
  return await createBrowser(transport, { persistent: true });
}
```

**Verify:**

```sh
# Should print 2 (the if-check + the helper definition).
grep -c 'connectToExternalWebSocket' lib/index.js
# Smoke-test that the package loads in Node.js:
node -e "import('./lib/index.js').then(m => console.log(typeof m.chromium))"
# Should print: function
```

If upstream merged equivalent external-CDP support, this patch is no
longer needed — drop it.

---

## 3. ESM type resolution

**Files:** `index.d.ts`, `internal.d.ts`, `test.d.ts`

**Why:** Upstream's type files use extension-less imports
(`from './types/types'`). With `moduleResolution: NodeNext` /
`moduleResolution: Node16` these fail to resolve, breaking type-checking
for downstream consumers. Add `.d.ts` extensions to every relative
import / export / module declaration.

**What:**

In `index.d.ts`:

```diff
-import type { Browser } from './types/types';
-import { chromium, request, selectors, devices } from './types/types';
+import type { Browser } from './types/types.d.ts';
+import { chromium, request, selectors, devices } from './types/types.d.ts';

-export * from './types/types';
+export * from './types/types.d.ts';

-declare module './types/types' {
+declare module './types/types.d.ts' {
```

In `internal.d.ts`:

```diff
-import { BrowserBindingName } from './tests/src/utils';
+import { BrowserBindingName } from './tests/src/utils.d.ts';

-export * from './tests';
-export { expect, _baseTest, Fixtures, mergeTests } from './types/test';
+export * from './tests.d.ts';
+export { expect, _baseTest, Fixtures, mergeTests } from './types/test.d.ts';
```

In `test.d.ts`:

```diff
-export * from './index';
-export { expect, mergeExpects } from './types/test';
+export * from './index.d.ts';
+export { expect, mergeExpects } from './types/test.d.ts';
```

**Verify:**

```sh
# Should print 0 — every relative .d.ts import has its extension.
grep -E "from '\./[^']+'" index.d.ts internal.d.ts test.d.ts | grep -v '\.d\.ts'
```

If upstream added `.d.ts` extensions itself, this patch is no longer
needed — drop it.

---

## 4. Orphaned session handling

**File:** `lib/playwright-core/src/server/chromium/crBrowser.js`

**Why:** When connected to a real Chrome via `connectOverCDP()`, Chrome
reports CDP targets for built-in extensions, shared workers, and other
internal purposes that have no `browserContextId`. The upstream code
asserts this field is always present, firing 1000+ unhandled rejections
per integration-test run. Detach the session instead.

**What:**

Find:

```js
    assert(targetInfo.browserContextId, "targetInfo: " + JSON.stringify(targetInfo, null, 2));
```

Replace with:

```js
    // Skip extension service workers and other targets without browserContextId
    // These are typically built-in Chrome extensions that Playwright doesn't manage
    if (!targetInfo.browserContextId) {
      session.detach().catch(() => {});
      return;
    }
```

The same `assert` exists in Microsoft's `playwright-core@1.60.0` at
`coreBundle.js:36978` — this patch fixes the symptom in both codebases
since `@cloudflare/playwright` is a fork of Microsoft's source.

**Verify:**

```sh
# Should print 0 (no live assert() for browserContextId in this file).
grep -c 'assert(targetInfo.browserContextId' lib/playwright-core/src/server/chromium/crBrowser.js
# Should print >= 1 (the graceful skip block).
grep -c '!targetInfo.browserContextId' lib/playwright-core/src/server/chromium/crBrowser.js
```

If upstream adds equivalent graceful handling, this patch is no longer
needed — drop it.

---

## Post-sync smoke check

After applying all four patches, run from the fork repo root:

```sh
node -e "import('./lib/index.js').then(m => console.log(typeof m.chromium, typeof m.request, typeof m.devices))"
```

Expected output: `function function function`

If any of those throws `Error: Cannot find module 'cloudflare:workers'`
or similar, patch 1 didn't apply correctly. If the import succeeds but
`chromium.connectOverCDP` is missing, the tarball layout changed — check
the README for the new file paths.

## After the patches

Then:

1. `echo NEW_VERSION > patches/BASE_VERSION`
2. Bump the fork's own `0.x` version in `package.json`
3. Update the `🏷️ Upstream Playwright version:` line in `README.md` to
   the new version
4. From the monorepo root (two levels up from this package), run `pnpm install` then
   `pnpm test:integration --runtime node -t "playwright"` to verify the
   consumer integration tests still pass
5. `git add -A && git commit -m "chore: sync upstream @cloudflare/playwright@NEW_VERSION"`