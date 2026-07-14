## 1. Basic Session + Scrape

### Steel Native — from [Steel Quickstart](https://docs.steel.dev/overview/sessions-api/quickstart)

<!-- verify:ignore -->

```typescript
import Steel from "steel-sdk";
import { chromium } from "playwright";

dotenv.config();

const client = new Steel({
  steelAPIKey: process.env.STEEL_API_KEY,
});

async function main() {
  let session;
  let browser;

  try {
    session = await client.sessions.create();
    console.log(`Session created! View at ${session.sessionViewerUrl}`);

    browser = await chromium.connectOverCDP(
      `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${session.id}`,
    );

    const page = await browser.contexts()[0].pages()[0];
    await page.goto("https://example.com");
    const title = await page.title();
    console.log(`Title: ${title}`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser?.close();
    if (session) {
      await client.sessions.release(session.id);
    }
  }
}

main().catch(console.error);
```

### With @effect-libs/browser

```typescript
import { Effect, Layer, Config } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* SteelProvider;

  return yield* playwright.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      console.log(`Session created! View at ${session.liveViewUrl}`);
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
});
// Session released automatically — success, error, or interruption

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        Playwright.layer,
        SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }),
      ),
    ),
  ),
);
```

**Key differences:**

- No manual `try/catch/finally` — `withSession` guarantees cleanup on success, error, or fiber interruption (timeout, cancellation)
- No manual Chrome DevTools Protocol URL construction — provider handles it
- Same pattern works with `@effect-libs/browser-cdp` if you don't need full upstream Playwright

---

## 2. Reusing Auth Across Sessions

### Steel Native — from [Steel — Reusing Auth & Context](https://docs.steel.dev/overview/sessions-api/reusing-auth-context)

<!-- verify:ignore -->

```typescript
import Steel from "steel-sdk";
import { chromium } from "playwright";

dotenv.config();

const client = new Steel({
  steelAPIKey: process.env.STEEL_API_KEY,
});

async function login(page: Page) {
  await page.goto("https://practice.expandtesting.com/login");
  await page.fill('input[name="username"]', "practice");
  await page.fill('input[name="password"]', "SuperSecretPassword!");
  await page.click('button[type="submit"]');
}

async function verifyAuth(page: Page): Promise<boolean> {
  await page.goto("https://practice.expandtesting.com/secure");
  const welcomeText = await page.textContent("#username");
  return welcomeText?.includes("Hi, practice!") ?? false;
}

async function main() {
  let session;
  let browser;

  try {
    // Step 1: Create and authenticate initial session
    session = await client.sessions.create();
    console.log(`Session #1 created! View at ${session.sessionViewerUrl}`);

    browser = await chromium.connectOverCDP(
      `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${session.id}`,
    );

    const page = await browser.contexts()[0].pages()[0];
    await login(page);

    if (await verifyAuth(page)) {
      console.log("✓ Authentication successful");
    }

    // Step 2: Capture and transfer authentication
    const sessionContext = await client.sessions.context(session.id);

    // Clean up first session
    await browser.close();
    await client.sessions.release(session.id);
    console.log("Session #1 released");

    // Step 3: Create new authenticated session
    session = await client.sessions.create({ sessionContext });
    console.log(`Session #2 created! View at ${session.sessionViewerUrl}`);

    browser = await chromium.connectOverCDP(
      `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${session.id}`,
    );

    const newPage = await browser.contexts()[0].pages()[0];
    if (await verifyAuth(newPage)) {
      console.log("✓ Authentication successfully transferred!");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser?.close();
    if (session) {
      await client.sessions.release(session.id);
      console.log("Session #2 released");
    }
  }
}

main().catch(console.error);
```

### With @effect-libs/browser

```typescript
import { Effect, Layer, Config } from "effect";

import { Playwright, type PlaywrightPage } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

const login = (page: PlaywrightPage) =>
  Effect.gen(function* () {
    yield* page.goto("https://practice.expandtesting.com/login");
    yield* page.fill('input[name="username"]', "practice");
    yield* page.fill('input[name="password"]', "SuperSecretPassword!");
    yield* page.click('button[type="submit"]');
  });

const verifyAuth = (page: PlaywrightPage) =>
  Effect.gen(function* () {
    yield* page.goto("https://practice.expandtesting.com/secure");
    const welcomeText = yield* page.locator("#username").textContent;
    return welcomeText?.includes("Hi, practice!") ?? false;
  });

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* SteelProvider;

  // Step 1: Create and authenticate initial session
  const sessionContext = yield* playwright.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      console.log(`Session #1 created! View at ${session.liveViewUrl}`);
      yield* login(page);
      const ok = yield* verifyAuth(page);
      if (ok) console.log("✓ Authentication successful");

      // Step 2: Capture context BEFORE session ends
      return yield* provider.use((client) => client.sessions.context(session.id));
    }),
  );
  // Session #1 released automatically, context captured

  // Step 3: Create new authenticated session with captured context
  yield* playwright.withSession({ provider, options: { sessionContext } }, ({ page, session }) =>
    Effect.gen(function* () {
      console.log(`Session #2 created! View at ${session.liveViewUrl}`);
      const ok = yield* verifyAuth(page);
      if (ok) console.log("✓ Authentication successfully transferred!");
    }),
  );
  // Session #2 released automatically
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        Playwright.layer,
        SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }),
      ),
    ),
  ),
);
```

**Key differences:**

- Context capture is explicit (`provider.use()`) but cleanup is automatic — no `finally` blocks
- Two `withSession` calls replace the manual create/connect/close/release cycle
- The Steel docs note: "Context can only be captured from a **live** session" — our pattern makes this obvious since `session.id` is only available inside `withSession`

---

## 3. Human-in-the-Loop

### Cloudflare Browser Run Native — from [CF Browser Run — Human in the Loop](https://developers.cloudflare.com/browser-run/features/human-in-the-loop/)

<!-- verify:ignore -->

```typescript
import puppeteer from "puppeteer-core";

const ACCOUNT_ID = "<your-account-id>";
const API_TOKEN = "<your-api-token>";

async function program() {
  // Create a browser session via the Chrome DevTools Protocol
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/browser-rendering/devtools/browser?keep_alive=600000&targets=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    },
  );

  const { webSocketDebuggerUrl, targets } = await response.json();
  const liveUrl = targets[0].devtoolsFrontendUrl;

  // Connect Puppeteer to the session
  const browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });

  const page = await browser.newPage();
  await page.goto("https://example.com/login");

  // Share the Live View URL with the human operator
  console.log(`Human input needed. Open this URL: ${liveUrl}`);

  // Wait for the human to complete login (5 minute timeout)
  await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 300000 });

  // Login complete, continue automation
  const cookies = await page.cookies();
  console.log("Login complete. Continuing automation...");

  await page.goto("https://example.com/dashboard");
  const content = await page.content();

  browser.disconnect();
}

program().catch(console.error);
```

### With @effect-libs/browser

<!-- verify:ignore -->

```typescript
import { Playwright } from "@effect-libs/browser-playwright";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";
import { Effect, Layer, Config } from "effect";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* CfBrowserRunProvider;

  return yield* playwright.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/login");

      // Share the live view URL with the human operator
      // (same field name across all providers — normalized by BrowserProviderSessionBase)
      console.log(`Human input needed. Open this URL: ${session.liveViewUrl}`);

      // Wait for the human to complete login (5 minute timeout)
      yield* page.waitForNavigation({ waitUntil: "networkidle", timeout: 300000 });

      // Login complete, continue automation
      console.log("Login complete. Continuing automation...");
      yield* page.goto("https://example.com/dashboard");
      return yield* page.content;
    }),
  );
});
// Session created and released automatically by withSession

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        Playwright.layer,
        CfBrowserRunProvider.layerConfig({
          accountId: Config.string("CF_ACCOUNT_ID"),
          apiKey: Config.redacted("CF_API_TOKEN"),
        }),
      ),
    ),
  ),
);
```

**Key differences:**

- `withSession` creates the session — no manual `fetch` to the CF API
- Session cleanup is automatic on success, error, or interruption
- `session.liveViewUrl` provides the live view URL — same field name across all providers (normalized by `BrowserProviderSessionBase`)
- Same pattern works identically for Steel and Browserbase — just swap the provider layer

---

## 4. Session Reuse (Keep Alive)

### Cloudflare Browser Run Native — from [CF Browser Run — Reuse Sessions](https://developers.cloudflare.com/browser-run/features/reuse-sessions/)

<!-- verify:ignore -->

```typescript
import puppeteer from "@cloudflare/puppeteer";

interface Env {
  MYBROWSER: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let reqUrl = url.searchParams.get("url") || "https://example.com";
    reqUrl = new URL(reqUrl).toString();

    // Pick random session from open sessions
    let sessionId = await this.getRandomSession(env.MYBROWSER);
    let browser, launched;

    if (sessionId) {
      try {
        browser = await puppeteer.connect(env.MYBROWSER, sessionId);
      } catch (e) {
        // another worker may have connected first
        console.log(`Failed to connect to ${sessionId}. Error ${e}`);
      }
    }

    if (!browser) {
      // No open sessions, launch new session
      browser = await puppeteer.launch(env.MYBROWSER);
      launched = true;
    }

    sessionId = browser.sessionId();

    // Do your work here
    const page = await browser.newPage();
    const response = await page.goto(reqUrl);
    const html = await response!.text();

    // All work done, so free connection (IMPORTANT!)
    browser.disconnect();

    return new Response(`${launched ? "Launched" : "Connected to"} ${sessionId} \n-----\n` + html, {
      headers: { "content-type": "text/plain" },
    });
  },

  // Pick random free session
  async getRandomSession(endpoint) {
    const sessions = await puppeteer.sessions(endpoint);
    const sessionsIds = sessions.filter((v) => !v.connectionId).map((v) => v.sessionId);

    if (sessionsIds.length === 0) return;

    return sessionsIds[Math.floor(Math.random() * sessionsIds.length)];
  },
};
```

### With @effect-libs/browser

Two separate concerns: **creating** a session (needs provider) vs **connecting** to one (just needs a URL).

<!-- verify:stubs -->

```typescript
import { Effect, Layer, Config, Option, Redacted } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";

interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  CDP_URL?: string; // Cached from a previous request
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url).searchParams.get("url") || "https://example.com";

    // If we have a cached CDP URL, just connect — no provider needed
    if (env.CDP_URL) {
      const cachedUrl = env.CDP_URL;
      return Effect.runPromise(
        Effect.gen(function* () {
          const playwright = yield* Playwright;
          const html = yield* playwright.withConnection({ url: cachedUrl }, ({ page }) =>
            Effect.gen(function* () {
              yield* page.goto(url);
              return yield* page.content;
            }),
          );
          return new Response(html, { headers: { "content-type": "text/plain" } });
        }).pipe(Effect.provide(Playwright.layer)),
      );
    }

    // No cached session — create one with the provider
    return Effect.runPromise(
      Effect.gen(function* () {
        const playwright = yield* Playwright;
        const provider = yield* CfBrowserRunProvider;

        return yield* playwright.withSession({ provider }, ({ page, session }) =>
          Effect.gen(function* () {
            yield* page.goto(url);
            const html = yield* page.content;

            // Cache the CDP URL for future requests (KV, Durable Objects, etc.)
            const cdpUrl = Redacted.value(Option.getOrThrow(provider.getCdpUrl(session.id)));
            // await kv.put("CDP_URL", cdpUrl);

            return new Response(html, { headers: { "content-type": "text/plain" } });
          }),
        );
      }).pipe(
        Effect.provide(
          Layer.merge(
            Playwright.layer,
            CfBrowserRunProvider.layerConfig({
              accountId: Config.succeed(env.CF_ACCOUNT_ID),
              apiKey: Config.succeed(Redacted.make(env.CF_API_TOKEN)),
            }),
          ),
        ),
      ),
    );
  },
};
```

**Key differences:**

- **Connecting to an existing session** (`withConnection`) needs no provider credentials — just a WebSocket URL
- **Creating a session** (`withSession`) needs the provider layer with credentials
- No `browser.disconnect()` vs `browser.close()` distinction — `withConnection` always disconnects (keeps session alive), `withSession` always releases
- Session discovery (finding free sessions) is the caller's responsibility — use KV, Durable Objects, or `puppeteer.sessions()` directly

---

## 5. Persistent Contexts (Browserbase)

### Browserbase Native — from [Browserbase — Contexts](https://docs.browserbase.com/platform/browser/core-features/contexts)

<!-- verify:ignore -->

```typescript
import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";

async function withPersistentContext() {
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

  // Create a persistent context
  const context = await bb.contexts.create();
  console.log(`Context ID: ${context.id}`);

  // Session 1: Login with context attached
  const session1 = await bb.sessions.create({
    browserSettings: {
      context: { id: context.id, persist: true },
    },
  });

  const browser1 = await chromium.connectOverCDP(session1.connectUrl);
  const defaultContext1 = browser1.contexts()[0];
  const page1 = defaultContext1?.pages()[0];

  await page1.goto("https://saas.example.com/login");
  await page1.fill("#email", "user@example.com");
  await page1.fill("#password", "password");
  await page1.click("#submit");
  await page1.waitForSelector(".dashboard");

  await browser1.close();
  await bb.sessions.release(session1.id);

  // Session 2: Same context — already logged in
  const session2 = await bb.sessions.create({
    browserSettings: {
      context: { id: context.id, persist: true },
    },
  });

  const browser2 = await chromium.connectOverCDP(session2.connectUrl);
  const defaultContext2 = browser2.contexts()[0];
  const page2 = defaultContext2?.pages()[0];

  await page2.goto("https://saas.example.com/dashboard");
  // Auth state persisted!

  const data = await page2.evaluate(() => extractData());
  await browser2.close();
  await bb.sessions.release(session2.id);

  return data;
}
```

### With @effect-libs/browser

<!-- verify:stubs -->

```typescript
import { Effect, Config } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";

const withPersistentContext = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* BrowserbaseProvider;

  // Create a persistent context via Browserbase SDK
  const context = yield* provider.use((client) => client.contexts.create());
  console.log(`Context ID: ${context.id}`);

  // Session 1: Login with the context attached
  yield* playwright.withSession(
    { provider, options: { browserSettings: { context: { id: context.id } } } },
    ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://saas.example.com/login");
        yield* page.fill("#email", "user@example.com");
        yield* page.fill("#password", "password");
        yield* page.click("#submit");
        yield* page.waitForSelector(".dashboard");
      }),
  );
  // Session #1 released, but context persists

  // Session 2: Same context — already logged in
  return yield* playwright.withSession(
    { provider, options: { browserSettings: { context: { id: context.id } } } },
    ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://saas.example.com/dashboard");
        // Auth state persisted!
        return yield* page.evaluate(() => extractData());
      }),
  );
});
```

**Key differences:**

- Context creation via `provider.use()` — direct SDK access when you need it
- Sessions are automatic, context is explicit
- Same pattern as Steel profiles — provider-specific persistence

---

## 6. Form Filling (Playwright)

### Browserbase Native — from [Browserbase — Automating Form Submissions](https://docs.browserbase.com/use-cases/automating-form-submissions)

<!-- verify:ignore -->

```typescript
import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { config } from "dotenv";
config();

async function createSession() {
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const session = await bb.sessions.create({
    // Add configuration options here
  });
  return session;
}

async function fillForm(inputs: any) {
  const session = await createSession();
  const browser = await chromium.connectOverCDP(session.connectUrl);

  // Getting the default context to ensure the sessions are recorded.
  const defaultContext = browser.contexts()[0];
  const page = defaultContext?.pages()[0];

  console.log(`View session recording at https://browserbase.com/sessions/${session.id}`);
  // Navigate to page
  await page.goto("https://forms.gle/f4yNQqZKBFCbCr6j7");

  // fill superpower
  await page.locator(`[role="radio"][data-value="${inputs.superpower}"]`).click();
  await page.waitForTimeout(1000);

  // fill features_used
  for (const feature of inputs.features_used) {
    await page.locator(`[role="checkbox"][aria-label="${feature}"]`).click();
  }
  await page.waitForTimeout(1000);

  // fill coolest_build
  await page.locator('input[jsname="YPqjbf"]').fill(inputs.coolest_build);
  await page.waitForTimeout(1000);

  // click submit button
  await page.locator('div[role="button"]:has-text("Submit")').click();

  // wait 10 seconds
  await page.waitForTimeout(10000);

  console.log("Shutting down...");
  await page.close();
  await browser.close();
}

const inputs = {
  superpower: "Invisibility",
  features_used: ["Verified", "Proxies", "Session Replay"],
  coolest_build: "A bot that automates form submissions across multiple sites.",
};
fillForm(inputs);
```

### With @effect-libs/browser

```typescript
import { Effect, Layer, Config } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";

const inputs = {
  superpower: "Invisibility",
  features_used: ["Verified", "Proxies", "Session Replay"],
  coolest_build: "A bot that automates form submissions across multiple sites.",
};

const fillForm = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* BrowserbaseProvider;

  return yield* playwright.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      console.log(`View session recording at https://browserbase.com/sessions/${session.id}`);

      // Navigate to page
      yield* page.goto("https://forms.gle/f4yNQqZKBFCbCr6j7");

      // fill superpower
      yield* page.locator(`[role="radio"][data-value="${inputs.superpower}"]`).click();
      yield* page.waitForTimeout(1000);

      // fill features_used
      for (const feature of inputs.features_used) {
        yield* page.locator(`[role="checkbox"][aria-label="${feature}"]`).click();
      }
      yield* page.waitForTimeout(1000);

      // fill coolest_build
      yield* page.locator('input[jsname="YPqjbf"]').fill(inputs.coolest_build);
      yield* page.waitForTimeout(1000);

      // click submit button
      yield* page.locator('div[role="button"]:has-text("Submit")').click();
      yield* page.waitForTimeout(10000);
    }),
  );
});
// Session released automatically

Effect.runPromise(
  fillForm.pipe(
    Effect.provide(
      Layer.merge(
        Playwright.layer,
        BrowserbaseProvider.layerConfig({ apiKey: Config.redacted("BROWSERBASE_API_KEY") }),
      ),
    ),
  ),
);
```

**Key differences:**

- No `createSession()` helper — `withSession` handles it
- No manual `page.close()` / `browser.close()` — automatic cleanup
- The Playwright locator API (`page.locator(...)`) works identically via `@effect-libs/browser-playwright`

---

## 7. Form Filling with Stagehand

### Browserbase Native — from [Browserbase — Automating Form Submissions](https://docs.browserbase.com/use-cases/automating-form-submissions)

<!-- verify:ignore -->

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
  });

  await stagehand.init();
  const page = stagehand.context.pages()[0];

  async function fillForm(inputs: any) {
    // Navigate to the form
    await page.goto("https://forms.gle/f4yNQqZKBFCbCr6j7");

    // Select the superpower radio button
    await stagehand.act(`Select the superpower: ${inputs.superpower}`);

    // Select the features used checkboxes
    await stagehand.act("Select the features used: " + inputs.features_used.join(", "));

    // Fill in the coolest build text field
    await stagehand.act(
      "Fill in the coolest_build field with the following value: " + inputs.coolest_build,
    );

    // Submit the form
    await stagehand.act("Click the submit button");
    await page.waitForTimeout(5000);

    // Extract to log the status of the form
    const status = await stagehand.extract({
      instruction: "Extract the status of the form",
      schema: z.object({ status: z.string() }),
    });
    console.log(status);

    await stagehand.close();
  }

  const inputs = {
    superpower: "Invisibility",
    features_used: ["Verified", "Proxies", "Session Replay"],
    coolest_build: "A bot that automates form submissions across multiple sites.",
  };

  await fillForm(inputs);
}

main().catch(console.error);
```

### With @effect-libs/browser

```typescript
import { Effect, Config, Layer } from "effect";
import { z } from "zod";

import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";
import { Stagehand } from "@effect-libs/browser-stagehand";

const inputs = {
  superpower: "Invisibility",
  features_used: ["Verified", "Proxies", "Session Replay"],
  coolest_build: "A bot that automates form submissions across multiple sites.",
};

const fillForm = Effect.gen(function* () {
  const stagehand = yield* Stagehand;
  const provider = yield* BrowserbaseProvider;

  return yield* stagehand.withSession({ provider }, ({ instance }) =>
    Effect.gen(function* () {
      yield* instance.use((s) => s.act("Navigate to https://forms.gle/f4yNQqZKBFCbCr6j7"));
      yield* instance.use((s) => s.act(`Select the superpower: ${inputs.superpower}`));
      yield* instance.use((s) =>
        s.act("Select the features used: " + inputs.features_used.join(", ")),
      );
      yield* instance.use((s) =>
        s.act("Fill in the coolest_build field with the following value: " + inputs.coolest_build),
      );
      yield* instance.use((s) => s.act("Click the submit button"));

      const status = yield* instance.use((s) =>
        s.extract("Extract the status of the form", z.object({ status: z.string() })),
      );
      console.log(status);
    }),
  );
});

Effect.runPromise(
  fillForm.pipe(
    Effect.provide(
      Layer.merge(
        Stagehand.layerConfig({
          model: Config.succeed("openai/gpt-4o"),
          apiKey: Config.redacted("OPENAI_API_KEY"),
        }),
        BrowserbaseProvider.layerConfig({ apiKey: Config.redacted("BROWSERBASE_API_KEY") }),
      ),
    ),
  ),
);
```

**Key differences:**

- `instance.use()` wraps Stagehand's callback-based API
- Session lifecycle is automatic — no `stagehand.init()` / `stagehand.close()`
- Can mix with `@effect-libs/browser-cdp` / `@effect-libs/browser-playwright` on the same session via `withConnection`

---

## Summary

| Pattern                 | Native code                                            | With @effect-libs/browser                       |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| **Cleanup**             | Manual `try/finally` at every level                    | Automatic via `withSession`/`withConnection`    |
| **Provider swap**       | Edit every call site                                   | Change one Layer                                |
| **Error handling**      | Untyped exceptions, string matching                    | Typed errors, pattern matching                  |
| **Interruption**        | Finally blocks don't run on timeout/SIGTERM            | Fibers guarantee cleanup                        |
| **Provider features**   | Direct SDK calls                                       | `provider.use()` with same API                  |
| **Connect to existing** | Manual Chrome DevTools Protocol URL + `connectOverCDP` | `withConnection(url, ...)` — no provider needed |

---

## See Also

- [Effect integration](../concepts/effect.md#if-you-already-use-effect) — How this library uses Effect v4 (errors, retries)
- [Managing Resources](../concepts/resources.md) — Session → connection → context → page hierarchy, plus pooling patterns
- [Managing Resources — Persisting auth](../concepts/resources.md#persisting-auth-across-sessions) — Save and restore auth across sessions
- [Steel Provider](../providers/steel.md) — Steel-specific setup
- [Browserbase Provider](../providers/browserbase.md) — Browserbase-specific setup
- [CF Browser Run Provider](../providers/cf-browser-run.md) — Cloudflare-specific setup
