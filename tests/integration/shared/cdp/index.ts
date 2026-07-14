/**
 * `browser-cdp` test registry — single entry point for all `browser-cdp` integration tests.
 *
 * Each runtime entry point (node, bun, deno, workerd) imports
 * `defineAllCdpTests` instead of individually importing every test file.
 * This eliminates duplication — adding a new test file only requires
 * updating this one file.
 *
 * @module tests/integration/shared/cdp/index
 */

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { defineAddScriptTagTests } from "./addScriptTag.js";
import { defineAddStyleTagTests } from "./addStyleTag.js";
import { defineCdpTests } from "./cdp.js";
import { defineCheckTests } from "./check.js";
import { defineClickTests } from "./click.js";
import { defineContextExtensionsTests } from "./context-extensions.js";
import { defineDialogTests } from "./dialogs.js";
import { defineDispatchEventTests } from "./dispatchEvent.js";
import { defineDownloadTests } from "./downloads.js";
import { defineDragAndDropTests } from "./dragAndDrop.js";
import { defineElementStateTests } from "./elementState.js";
import { defineEmulateMediaTests } from "./emulateMedia.js";
import { defineEvalOnSelectorTests } from "./evalOnSelector.js";
import { defineEvaluateTests } from "./evaluate.js";
import { defineEvaluateHandleTests } from "./evaluateHandle.js";
import { defineExposeFunctionTests } from "./exposeFunction.js";
import { defineExtraHttpHeadersTests } from "./extraHttpHeaders.js";
import { defineFillTests } from "./fill.js";
import { defineFocusTests } from "./focus.js";
import { defineFrameExtensionsTests } from "./frame-extensions.js";
import { defineFrameTests } from "./frame.js";
import { defineGotoTests } from "./goto.js";
import { defineGrantPermissionsTests } from "./grantPermissions.js";
import { defineHistoryTests } from "./history.js";
import { defineInputValueTests } from "./inputValue.js";
import { defineKeyboardTests } from "./keyboard.js";
import { defineLocatorExtensionsTests } from "./locator-extensions.js";
import { defineLocatorTests } from "./locator.js";
import { defineMouseTests } from "./mouse.js";
import { definePageCookiesTests } from "./pageCookies.js";
import { definePageErrorTests } from "./pageErrors.js";
import { definePageStateTests } from "./pageState.js";
import { defineRequestTests } from "./request.js";
import { defineRouteTests } from "./route.js";
import { defineRouteWebSocketTests } from "./routeWebSocket.js";
import { defineSelectOptionTests } from "./selectOption.js";
import { defineSetContentTests } from "./setContent.js";
import { defineSetGeolocationTests } from "./setGeolocation.js";
import { defineSetInputFilesTests } from "./setInputFiles.js";
import { defineSetOfflineTests } from "./setOffline.js";
import { defineSetUserAgentTests } from "./setUserAgent.js";
import { defineStorageTests } from "./storage.js";
import { defineStorageStateTests } from "./storageState.js";
import { defineTapTests } from "./tap.js";
import { defineTextContentTests } from "./textContent.js";
import { defineTouchscreenTests } from "./touchscreen.js";
import { defineViewportTests } from "./viewport.js";
import { defineVisibilityTests } from "./visibility.js";
import { defineWaitForFunctionTests } from "./waitForFunction.js";
import { defineWaitForLoadStateTests } from "./waitForLoadState.js";
import { defineWaitForNavigationTests } from "./waitForNavigation.js";
import { defineWaitForSelectorTests } from "./waitForSelector.js";
import { defineWaitForURLTests } from "./waitForURL.js";

/**
 * Register all `browser-cdp` integration tests.
 *
 * Call once from each runtime's entry point:
 * ```typescript
 * import { defineAllCdpTests } from "../shared/cdp/index.js";
 * const api = make();
 * defineAllCdpTests(api, config);
 * ```
 */
export const defineAllCdpTests = (api: TestApi, config: TestConfig): void => {
  // Legacy organic tests (broad smoke coverage)
  defineCdpTests(api, config);

  defineContextExtensionsTests(api, config);

  // Parity tests (from upstream Playwright specs)
  defineClickTests(api, config);
  defineTapTests(api, config);
  defineFillTests(api, config);
  defineWaitForNavigationTests(api, config);
  defineWaitForLoadStateTests(api, config);
  defineGotoTests(api, config);
  defineGrantPermissionsTests(api, config);
  defineHistoryTests(api, config);
  defineEvaluateTests(api, config);
  defineEvaluateHandleTests(api, config);
  defineEvalOnSelectorTests(api, config);
  defineSetContentTests(api, config);
  defineWaitForFunctionTests(api, config);
  defineRouteTests(api, config);
  defineRequestTests(api, config);
  defineRouteWebSocketTests(api, config);
  defineSelectOptionTests(api, config);
  defineExtraHttpHeadersTests(api, config);
  defineKeyboardTests(api, config);
  defineMouseTests(api, config);
  defineTouchscreenTests(api, config);
  defineWaitForURLTests(api, config);
  defineFocusTests(api, config);
  defineCheckTests(api, config);
  defineFocusTests(api, config);
  defineViewportTests(api, config);
  defineVisibilityTests(api, config);
  defineFrameTests(api, config);
  defineFrameExtensionsTests(api, config);
  defineWaitForSelectorTests(api, config);
  defineLocatorTests(api, config);
  defineLocatorExtensionsTests(api, config);
  defineAddScriptTagTests(api, config);
  defineAddStyleTagTests(api, config);
  defineDialogTests(api, config);
  defineDispatchEventTests(api, config);
  defineDownloadTests(api, config);
  defineDragAndDropTests(api, config);
  defineEmulateMediaTests(api, config);
  definePageErrorTests(api, config);
  definePageStateTests(api, config);
  definePageCookiesTests(api, config);
  defineSetGeolocationTests(api, config);
  defineSetInputFilesTests(api, config);
  defineSetOfflineTests(api, config);
  defineSetUserAgentTests(api, config);
  defineStorageTests(api, config);
  defineStorageStateTests(api, config);

  // Organic tests (no upstream spec)
  defineInputValueTests(api, config);
  defineTextContentTests(api, config);
  defineElementStateTests(api, config);
  defineTextContentTests(api, config);
  defineInputValueTests(api, config);
  defineExposeFunctionTests(api, config);
};
