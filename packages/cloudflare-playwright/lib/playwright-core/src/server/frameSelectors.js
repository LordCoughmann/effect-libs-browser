import { asLocator } from '../utils/isomorphic/locatorGenerators.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import './utils/debug.js';
import './utils/debugLogger.js';
import './utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../zipBundle.js';
import './utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import './utils/happyEyeballs.js';
import './utils/nodePlatform.js';
import './utils/profiler.js';
import './utils/socksProxy.js';
import 'node:os';
import './utils/zones.js';
import { splitSelectorByFrame, visitAllSelectorParts, stringifySelector } from '../utils/isomorphic/selectorParser.js';
import { InvalidSelectorError } from '../utils/isomorphic/cssParser.js';

class FrameSelectors {
  constructor(frame) {
    this.frame = frame;
  }
  _parseSelector(selector, options) {
    const strict = typeof options?.strict === "boolean" ? options.strict : !!this.frame._page.browserContext._options.strictSelectors;
    return this.frame._page.browserContext.selectors().parseSelector(selector, strict);
  }
  async query(selector, options, scope) {
    const resolved = await this.resolveInjectedForSelector(selector, options, scope);
    if (!resolved)
      return null;
    const handle = await resolved.injected.evaluateHandle((injected, { info, scope: scope2 }) => {
      return injected.querySelector(info.parsed, scope2 || document, info.strict);
    }, { info: resolved.info, scope: resolved.scope });
    const elementHandle = handle.asElement();
    if (!elementHandle) {
      handle.dispose();
      return null;
    }
    return adoptIfNeeded(elementHandle, await resolved.frame._mainContext());
  }
  async queryArrayInMainWorld(selector, scope) {
    const resolved = await this.resolveInjectedForSelector(selector, { mainWorld: true }, scope);
    if (!resolved)
      throw new Error(`Failed to find frame for selector "${selector}"`);
    return await resolved.injected.evaluateHandle((injected, { info, scope: scope2 }) => {
      const elements = injected.querySelectorAll(info.parsed, scope2 || document);
      injected.checkDeprecatedSelectorUsage(info.parsed, elements);
      return elements;
    }, { info: resolved.info, scope: resolved.scope });
  }
  async queryCount(selector, options) {
    const resolved = await this.resolveInjectedForSelector(selector);
    if (!resolved)
      throw new Error(`Failed to find frame for selector "${selector}"`);
    await options.__testHookBeforeQuery?.();
    return await resolved.injected.evaluate((injected, { info }) => {
      const elements = injected.querySelectorAll(info.parsed, document);
      injected.checkDeprecatedSelectorUsage(info.parsed, elements);
      return elements.length;
    }, { info: resolved.info });
  }
  async queryAll(selector, scope) {
    const resolved = await this.resolveInjectedForSelector(selector, {}, scope);
    if (!resolved)
      return [];
    const arrayHandle = await resolved.injected.evaluateHandle((injected, { info, scope: scope2 }) => {
      const elements = injected.querySelectorAll(info.parsed, scope2 || document);
      injected.checkDeprecatedSelectorUsage(info.parsed, elements);
      return elements;
    }, { info: resolved.info, scope: resolved.scope });
    const properties = await arrayHandle.getProperties();
    arrayHandle.dispose();
    const targetContext = await resolved.frame._mainContext();
    const result = [];
    for (const property of properties.values()) {
      const elementHandle = property.asElement();
      if (elementHandle)
        result.push(adoptIfNeeded(elementHandle, targetContext));
      else
        property.dispose();
    }
    return Promise.all(result);
  }
  _jumpToAriaRefFrameIfNeeded(selector, info, frame) {
    if (info.parsed.parts[0].name !== "aria-ref")
      return frame;
    const body = info.parsed.parts[0].body;
    const match = body.match(/^f(\d+)e\d+$/);
    if (!match)
      return frame;
    const frameSeq = +match[1];
    const jumptToFrame = this.frame._page.frameManager.frames().find((frame2) => frame2.seq === frameSeq);
    if (!jumptToFrame)
      throw new InvalidSelectorError(`Invalid frame in aria-ref selector "${selector}"`);
    return jumptToFrame;
  }
  async resolveFrameForSelector(selector, options = {}, scope) {
    let frame = this.frame;
    const frameChunks = splitSelectorByFrame(selector);
    for (const chunk of frameChunks) {
      visitAllSelectorParts(chunk, (part, nested) => {
        if (nested && part.name === "internal:control" && part.body === "enter-frame") {
          const locator = asLocator(this.frame._page.browserContext._browser.sdkLanguage(), selector);
          throw new InvalidSelectorError(`Frame locators are not allowed inside composite locators, while querying "${locator}"`);
        }
      });
    }
    for (let i = 0; i < frameChunks.length - 1; ++i) {
      const info = this._parseSelector(frameChunks[i], options);
      frame = this._jumpToAriaRefFrameIfNeeded(selector, info, frame);
      const context = await frame._context(info.world);
      const injectedScript = await context.injectedScript();
      const handle = await injectedScript.evaluateHandle((injected, { info: info2, scope: scope2, selectorString }) => {
        const element2 = injected.querySelector(info2.parsed, scope2 || document, info2.strict);
        if (element2 && element2.nodeName !== "IFRAME" && element2.nodeName !== "FRAME")
          throw injected.createStacklessError(`Selector "${selectorString}" resolved to ${injected.previewNode(element2)}, <iframe> was expected`);
        return element2;
      }, { info, scope: i === 0 ? scope : void 0, selectorString: stringifySelector(info.parsed) });
      const element = handle.asElement();
      if (!element)
        return null;
      const maybeFrame = await frame._page.delegate.getContentFrame(element);
      element.dispose();
      if (!maybeFrame)
        return null;
      frame = maybeFrame;
    }
    if (frame !== this.frame)
      scope = void 0;
    const lastChunk = frame.selectors._parseSelector(frameChunks[frameChunks.length - 1], options);
    frame = this._jumpToAriaRefFrameIfNeeded(selector, lastChunk, frame);
    return { frame, info: lastChunk, scope };
  }
  async resolveInjectedForSelector(selector, options, scope) {
    const resolved = await this.resolveFrameForSelector(selector, options, scope);
    if (!resolved)
      return;
    const context = await resolved.frame._context(options?.mainWorld ? "main" : resolved.info.world);
    const injected = await context.injectedScript();
    return { injected, info: resolved.info, frame: resolved.frame, scope: resolved.scope };
  }
}
async function adoptIfNeeded(handle, context) {
  if (handle._context === context)
    return handle;
  const adopted = await handle._page.delegate.adoptElementHandle(handle, context);
  handle.dispose();
  return adopted;
}

export { FrameSelectors };
