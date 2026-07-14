/**
 * Parity tests for `browser-cdp` page.$eval() and page.$$eval()
 *
 * Adapted from:
 *   - repos/cloudflare-playwright/tests/page/eval-on-selector.spec.ts (26 tests)
 *   - repos/cloudflare-playwright/tests/page/eval-on-selector-all.spec.ts (9 tests)
 *
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Key differences from upstream:
 *   - `browser-cdp` uses document.querySelector (CSS-only), no selector engine
 *   - $eval / $$eval are Effect-based, not Promise-based
 *   - Error type is CdpError wrapping SelectorError
 *   - No ElementHandle support (not planned for `browser-cdp`)
 *
 * Selector engine features now supported:
 *   - css= prefix (strips prefix, uses querySelector)
 *   - text= selector (iterates DOM, matches textContent)
 *   - xpath= selector (uses document.evaluate())
 *   - >> chaining syntax (executes selectors sequentially)
 *
 * Selector engine features NOT supported:
 *   - id= prefix (Playwright selector engine — use #id)
 *   - data-test=, data-testid=, data-test-id= prefixes (use [data-test="foo"])
 *   - * capture modifier (Playwright selector capture)
 *
 * NOTE: All passing tests use test.live because @effect/vitest's test.effect
 * injects TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Result } from "effect";

import { CdpError } from "@effect-libs/browser-cdp";
import { Cdp } from "@effect-libs/browser-cdp";

import {
  assertEqual,
  assertDeepEqual,
  assertContains,
  assertTrue,
} from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineEvalOnSelectorTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  // ═══════════════════════════════════════════════════════════════════════════════
  // $eval — eval-on-selector.spec.ts (26 upstream tests)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("$eval parity", () => {
    // ── Passing tests (`browser-cdp` supports this behavior) ──────────────────────

    test.live("eval-on-selector.spec.ts - should auto-detect css selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("section", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector.spec.ts - should auto-detect css selector with attributes", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval('section[id="testAttribute"]', (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector.spec.ts - should accept arguments", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<section>hello</section>");
            const text = yield* page.$eval(
              "section",
              (e, suffix: string) => e.textContent + suffix,
              " world!",
            );
            yield* assertEqual(text, "hello world!");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector.spec.ts - should throw error if no element is found", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>no section here</div>");
            const result = yield* Effect.result(page.$eval("section", (e) => e.id));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail("Expected effect to fail, but it succeeded");
            }
            const err = result.failure;
            yield* assertTrue(err instanceof CdpError);
            yield* assertTrue(err.reason._tag === "effect-libs/browser/CdpError/SelectorError");
            if (err.reason._tag === "effect-libs/browser/CdpError/SelectorError") {
              yield* assertContains(err.reason.description, "section");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector.spec.ts - should return complex values", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("section", (e) => [{ id: e.id }]);
            yield* assertDeepEqual(idAttribute, [{ id: "testAttribute" }]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Skipped tests (`browser-cdp` does not support this behavior) ──────────────

    // Playwright selector engine: css= prefix routes to Playwright's CSS engine.
    // Now supported by our SelectorEngine module.
    test.live("eval-on-selector.spec.ts - should work with css selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("css=section", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Playwright selector engine: id= prefix maps to getElementById.
    // `browser-cdp` has no selector engine — users should use CSS: #testAttribute
    test.skip("eval-on-selector.spec.ts - should work with id selector [SKIP: NOT_PLANNED - id= prefix, use #id]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("id=testAttribute", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // Playwright selector engines: data-test=, data-testid=, data-test-id= prefixes.
    // `browser-cdp` has no selector engine — users should use CSS: [data-test="foo"]
    test.skip("eval-on-selector.spec.ts - should work with data-test selector [SKIP: NOT_PLANNED - data-test= prefix]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section data-test=foo id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("data-test=foo", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.skip("eval-on-selector.spec.ts - should work with data-testid selector [SKIP: NOT_PLANNED - data-testid= prefix]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section data-testid=foo id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("data-testid=foo", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.skip("eval-on-selector.spec.ts - should work with data-test-id selector [SKIP: NOT_PLANNED - data-test-id= prefix]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section data-test-id=foo id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("data-test-id=foo", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // Text selector engine: finds elements by text content.
    // Now supported by our SelectorEngine module.
    test.live("eval-on-selector.spec.ts - should work with text selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("text=43543", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector.spec.ts - should work with text selector in quotes", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval('text="43543"', (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // XPath selector engine: uses document.evaluate().
    // Now supported by our SelectorEngine module.
    test.live("eval-on-selector.spec.ts - should work with xpath selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<section id="testAttribute">43543</section>');
            const idAttribute = yield* page.$eval("xpath=/html/body/section", (e) => e.id);
            yield* assertEqual(idAttribute, "testAttribute");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // >> chaining combines multiple selector engines.
    // Now supported by our SelectorEngine module.
    test.live("eval-on-selector.spec.ts - should auto-detect nested selectors", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              "<div foo=bar><section>43543<span>Hello<div id=target></div></span></section></div>",
            );
            const idAttribute = yield* page.$eval(
              'div[foo=bar] > section >> "Hello" >> div',
              (e) => e.id,
            );
            yield* assertEqual(idAttribute, "target");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector.spec.ts - should support >> syntax", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<section><div>hello</div></section>");
            const text = yield* page.$eval(
              "css=section >> css=div",
              (e, suffix: string) => e.textContent + suffix,
              " world!",
            );
            yield* assertEqual(text, "hello world!");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector.spec.ts - should support >> syntax with different engines", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<section><div><span>hello</span></div></section>");
            const text = yield* page.$eval(
              'xpath=/html/body/section >> css=div >> text="hello"',
              (e, suffix: string) => e.textContent + suffix,
              " world!",
            );
            yield* assertEqual(text, "hello world!");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // >> chaining with spaces - needs deep-shadow.html test asset
    test.live("eval-on-selector.spec.ts - should support spaces with >> syntax", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/deep-shadow.html`);
            const text = yield* page.$eval(
              " css = div >>css=div>>css   = span  ",
              (e) => e.textContent,
            );
            yield* assertEqual(text, "Hello from root2");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // >> chaining - the test expects specific behavior that needs investigation
    test.live("eval-on-selector.spec.ts - should not stop at first failure with >> syntax", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              "<div><span>Next</span><button>Previous</button><button>Next</button></div>",
            );
            const html = yield* page.$eval('button >> "Next"', (e) => e.outerHTML);
            yield* assertEqual(html, "<button>Next</button>");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // * capture modifier is part of Playwright's selector parser.
    test.skip("eval-on-selector.spec.ts - should support * capture [SKIP: NOT_PLANNED - * capture syntax]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              "<section><div><span>a</span></div></section><section><div><span>b</span></div></section>",
            );
            const html = yield* page.$eval('*css=div >> "b"', (e) => e.outerHTML);
            yield* assertEqual(html, "<div><span>b</span></div>");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.skip("eval-on-selector.spec.ts - should throw on multiple * captures [SKIP: NOT_PLANNED - * capture syntax]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div></div>");
            const result = yield* Effect.result(
              page.$eval("*css=div >> *css=span", (e) => e.outerHTML),
            );
            if (Result.isSuccess(result)) {
              return yield* Effect.fail("Expected error, got success");
            }
            yield* assertContains(String(result.failure), "Only one of the selectors can capture");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.skip("eval-on-selector.spec.ts - should throw on malformed * capture [SKIP: NOT_PLANNED - * capture syntax]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div></div>");
            const result = yield* Effect.result(page.$eval("*=div", (e) => e.outerHTML));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail("Expected error, got success");
            }
            yield* assertContains(String(result.failure), "Unknown engine");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ElementHandle not planned for `browser-cdp` — see FIX_TESTS_TODO.md "Not planned".
    test.skip("eval-on-selector.spec.ts - should accept ElementHandles as arguments [SKIP: NOT_PLANNED - ElementHandle API]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<section>hello</section><div> world</div>");
            // Would need page.$() returning ElementHandle — not supported
            const text = yield* page.$eval(
              "section",
              (e, div: Element) => e.textContent + div.textContent,
              null as any, // Would be divHandle from page.$('div')
            );
            yield* assertEqual(text, "hello world");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // These upstream tests exercise waitForSelector and $() alongside $eval.
    // The $eval parts would pass (CSS attribute selectors work with querySelector),
    // but the test also calls waitForSelector and $() which return ElementHandle.
    test.skip("eval-on-selector.spec.ts - should work with spaces in css attributes [SKIP: NOT_PLANNED - mixed API test]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<div><input placeholder="Select date"></div>');
            // Upstream also tests waitForSelector and $() here — omitted
            const html = yield* page.$eval('[placeholder="Select date"]', (e) => e.outerHTML);
            yield* assertEqual(html, '<input placeholder="Select date">');
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.skip("eval-on-selector.spec.ts - should work with quotes in css attributes [SKIP: NOT_PLANNED - mixed API test]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<div><input placeholder="Select&quot;date"></div>');
            // Upstream also tests $() — omitted
            const html = yield* page.$eval(`[placeholder='Select"date']`, (e) => e.outerHTML);
            yield* assertEqual(html, '<input placeholder="Select&quot;date">');
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // These tests are primarily about waitForSelector returning null / resolving.
    // $eval behavior is secondary — the interesting behavior is waitForSelector's.
    test.skip("eval-on-selector.spec.ts - should work with spaces in css attributes when missing [SKIP: NOT_PLANNED - tests different API]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>no input here</div>");
            // Upstream tests that $() returns null and waitForSelector resolves later
            // No meaningful $eval behavior to test here
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.skip("eval-on-selector.spec.ts - should work with quotes in css attributes when missing [SKIP: NOT_PLANNED - tests different API]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>no input here</div>");
            // Same as above — tests waitForSelector, not $eval
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // $$eval — eval-on-selector-all.spec.ts (9 upstream tests)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("$$eval parity", () => {
    // ── Passing tests ──────────────────────────────────────────────────────────

    test.live("eval-on-selector-all.spec.ts - should auto-detect css selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div><div>beautiful</div><div>world!</div>");
            const divsCount = yield* page.$$eval("div", (divs) => divs.length);
            yield* assertEqual(divsCount, 3);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector-all.spec.ts - should return complex values", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div><div>beautiful</div><div>world!</div>");
            const texts = yield* page.$$eval("div", (divs) => divs.map((div) => div.textContent));
            yield* assertDeepEqual(texts, ["hello", "beautiful", "world!"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("eval-on-selector-all.spec.ts - should work with bogus Array.from", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div><div>beautiful</div><div>world!</div>");
            yield* page.evaluate(() => {
              (Array as any).from = () => [];
            });
            const divsCount = yield* page.$$eval("div", (divs) => divs.length);
            yield* assertEqual(divsCount, 3);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Skipped tests ──────────────────────────────────────────────────────────

    // css= prefix now supported by SelectorEngine.
    test.live("eval-on-selector-all.spec.ts - should work with css selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div><div>beautiful</div><div>world!</div>");
            const divsCount = yield* page.$$eval("css=div", (divs) => divs.length);
            yield* assertEqual(divsCount, 3);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Text selector now supported by SelectorEngine.
    test.live("eval-on-selector-all.spec.ts - should work with text selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              "<div>hello</div><div>beautiful</div><div>beautiful</div><div>world!</div>",
            );
            const divsCount = yield* page.$$eval('text="beautiful"', (divs) => divs.length);
            yield* assertEqual(divsCount, 2);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // XPath selector now supported by SelectorEngine.
    test.live("eval-on-selector-all.spec.ts - should work with xpath selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div><div>beautiful</div><div>world!</div>");
            const divsCount = yield* page.$$eval("xpath=/html/body/div", (divs) => divs.length);
            yield* assertEqual(divsCount, 3);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // >> chaining now supported by SelectorEngine.
    test.live("eval-on-selector-all.spec.ts - should support >> syntax", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              "<div><span>hello</span></div><div>beautiful</div><div><span>wo</span><span>rld!</span></div><span>Not this one</span>",
            );
            const spansCount = yield* page.$$eval("css=div >> css=span", (spans) => spans.length);
            yield* assertEqual(spansCount, 3);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.skip("eval-on-selector-all.spec.ts - should support * capture [SKIP: NOT_PLANNED - * capture syntax]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              "<section><div><span>a</span></div></section><section><div><span>b</span></div></section>",
            );
            const count = yield* page.$$eval('*css=div >> "b"', (els) => els.length);
            yield* assertEqual(count, 1);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.skip("eval-on-selector-all.spec.ts - should support * capture when multiple paths match [SKIP: NOT_PLANNED - * capture syntax]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div><div><span></span></div></div><div></div>");
            const count = yield* page.$$eval("*css=div >> span", (els) => els.length);
            yield* assertEqual(count, 2);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));
  });
};
