import { SdkObject, createInstrumentation } from './instrumentation.js';
import { gracefullyProcessExitDoNotHang } from './utils/processLauncher.js';
import { Recorder, RecorderEvent } from './recorder.js';
import { parseAriaSnapshotUnsafe } from '../utils/isomorphic/ariaSnapshot.js';
import { asLocator } from '../utils/isomorphic/locatorGenerators.js';
import '../../../_virtual/pixelmatch.js';
import { yaml } from '../utilsBundle.js';
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
import { unsafeLocatorOrSelectorAsSelector } from '../utils/isomorphic/locatorParser.js';
import { generateCode } from './codegen/language.js';
import { collapseActions } from './recorder/recorderUtils.js';
import { JavaScriptLanguageGenerator } from './codegen/javascript.js';

class DebugController extends SdkObject {
  constructor(playwright) {
    super({ attribution: { isInternalPlaywright: true }, instrumentation: createInstrumentation() }, void 0, "DebugController");
    this._sdkLanguage = "javascript";
    this._generateAutoExpect = false;
    this._playwright = playwright;
  }
  static {
    this.Events = {
      StateChanged: "stateChanged",
      InspectRequested: "inspectRequested",
      SourceChanged: "sourceChanged",
      Paused: "paused",
      SetModeRequested: "setModeRequested"
    };
  }
  initialize(codegenId, sdkLanguage) {
    this._sdkLanguage = sdkLanguage;
  }
  dispose() {
    this.setReportStateChanged(false);
  }
  setReportStateChanged(enabled) {
    if (enabled && !this._trackHierarchyListener) {
      this._trackHierarchyListener = {
        onPageOpen: () => this._emitSnapshot(false),
        onPageClose: () => this._emitSnapshot(false)
      };
      this._playwright.instrumentation.addListener(this._trackHierarchyListener, null);
      this._emitSnapshot(true);
    } else if (!enabled && this._trackHierarchyListener) {
      this._playwright.instrumentation.removeListener(this._trackHierarchyListener);
      this._trackHierarchyListener = void 0;
    }
  }
  async setRecorderMode(progress, params) {
    await progress.race(this._closeBrowsersWithoutPages());
    this._generateAutoExpect = !!params.generateAutoExpect;
    if (params.mode === "none") {
      for (const recorder of await progress.race(this._allRecorders())) {
        recorder.hideHighlightedSelector();
        recorder.setMode("none");
      }
      return;
    }
    if (!this._playwright.allBrowsers().length)
      await this._playwright.chromium.launch(progress, { headless: !!process.env.PW_DEBUG_CONTROLLER_HEADLESS });
    const pages = this._playwright.allPages();
    if (!pages.length) {
      const [browser] = this._playwright.allBrowsers();
      const context = await browser.newContextForReuse(progress, {});
      await context.newPage(progress);
    }
    if (params.testIdAttributeName) {
      for (const page of this._playwright.allPages())
        page.browserContext.selectors().setTestIdAttributeName(params.testIdAttributeName);
    }
    for (const recorder of await progress.race(this._allRecorders())) {
      recorder.hideHighlightedSelector();
      recorder.setMode(params.mode);
    }
  }
  async highlight(progress, params) {
    if (params.selector)
      unsafeLocatorOrSelectorAsSelector(this._sdkLanguage, params.selector, "data-testid");
    const ariaTemplate = params.ariaTemplate ? parseAriaSnapshotUnsafe(yaml, params.ariaTemplate) : void 0;
    for (const recorder of await progress.race(this._allRecorders())) {
      if (ariaTemplate)
        recorder.setHighlightedAriaTemplate(ariaTemplate);
      else if (params.selector)
        recorder.setHighlightedSelector(params.selector);
    }
  }
  async hideHighlight(progress) {
    for (const recorder of await progress.race(this._allRecorders()))
      recorder.hideHighlightedSelector();
    await Promise.all(this._playwright.allPages().map((p) => p.hideHighlight().catch(() => {
    })));
  }
  async resume(progress) {
    for (const recorder of await progress.race(this._allRecorders()))
      recorder.resume();
  }
  kill() {
    gracefullyProcessExitDoNotHang(0);
  }
  _emitSnapshot(initial) {
    const pageCount = this._playwright.allPages().length;
    if (initial && !pageCount)
      return;
    this.emit(DebugController.Events.StateChanged, { pageCount });
  }
  async _allRecorders() {
    const contexts = /* @__PURE__ */ new Set();
    for (const page of this._playwright.allPages())
      contexts.add(page.browserContext);
    const recorders = await Promise.all([...contexts].map((c) => Recorder.forContext(c, { omitCallTracking: true })));
    const nonNullRecorders = recorders.filter(Boolean);
    for (const recorder of recorders)
      wireListeners(recorder, this);
    return nonNullRecorders;
  }
  async _closeBrowsersWithoutPages() {
    for (const browser of this._playwright.allBrowsers()) {
      for (const context of browser.contexts()) {
        if (!context.pages().length)
          await context.close({ reason: "Browser collected" });
      }
      if (!browser.contexts())
        await browser.close({ reason: "Browser collected" });
    }
  }
}
const wiredSymbol = Symbol("wired");
function wireListeners(recorder, debugController) {
  if (recorder[wiredSymbol])
    return;
  recorder[wiredSymbol] = true;
  const actions = [];
  const languageGenerator = new JavaScriptLanguageGenerator(
    /* isPlaywrightTest */
    true
  );
  const actionsChanged = () => {
    const aa = collapseActions(actions);
    const { header, footer, text, actionTexts } = generateCode(aa, languageGenerator, {
      browserName: "chromium",
      launchOptions: {},
      contextOptions: {},
      generateAutoExpect: debugController._generateAutoExpect
    });
    debugController.emit(DebugController.Events.SourceChanged, { text, header, footer, actions: actionTexts });
  };
  recorder.on(RecorderEvent.ElementPicked, (elementInfo) => {
    const locator = asLocator(debugController._sdkLanguage, elementInfo.selector);
    debugController.emit(DebugController.Events.InspectRequested, { selector: elementInfo.selector, locator, ariaSnapshot: elementInfo.ariaSnapshot });
  });
  recorder.on(RecorderEvent.PausedStateChanged, (paused) => {
    debugController.emit(DebugController.Events.Paused, { paused });
  });
  recorder.on(RecorderEvent.ModeChanged, (mode) => {
    debugController.emit(DebugController.Events.SetModeRequested, { mode });
  });
  recorder.on(RecorderEvent.ActionAdded, (action) => {
    actions.push(action);
    actionsChanged();
  });
  recorder.on(RecorderEvent.SignalAdded, (signal) => {
    const lastAction = actions.findLast((a) => a.frame.pageGuid === signal.frame.pageGuid);
    if (lastAction)
      lastAction.action.signals.push(signal.signal);
    actionsChanged();
  });
}

export { DebugController };
