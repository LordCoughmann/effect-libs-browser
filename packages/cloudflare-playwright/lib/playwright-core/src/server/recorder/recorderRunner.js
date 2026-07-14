import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import { serializeExpectedTextValues } from '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';
import { toKeyboardModifiers } from '../codegen/language.js';
import { mainFrameForAction, buildFullSelector } from './recorderUtils.js';
import { ProgressController } from '../progress.js';

async function performAction(pageAliases, actionInContext) {
  const mainFrame = mainFrameForAction(pageAliases, actionInContext);
  const controller = new ProgressController();
  const kActionTimeout = 5e3;
  return await controller.run((progress) => performActionImpl(progress, mainFrame, actionInContext), kActionTimeout);
}
async function performActionImpl(progress, mainFrame, actionInContext) {
  const { action } = actionInContext;
  if (action.name === "navigate") {
    await mainFrame.goto(progress, action.url);
    return;
  }
  if (action.name === "openPage")
    throw Error("Not reached");
  if (action.name === "closePage") {
    await mainFrame._page.close();
    return;
  }
  const selector = buildFullSelector(actionInContext.frame.framePath, action.selector);
  if (action.name === "click") {
    const options = toClickOptions(action);
    await mainFrame.click(progress, selector, { ...options, strict: true });
    return;
  }
  if (action.name === "hover") {
    await mainFrame.hover(progress, selector, { position: action.position, strict: true });
    return;
  }
  if (action.name === "press") {
    const modifiers = toKeyboardModifiers(action.modifiers);
    const shortcut = [...modifiers, action.key].join("+");
    await mainFrame.press(progress, selector, shortcut, { strict: true });
    return;
  }
  if (action.name === "fill") {
    await mainFrame.fill(progress, selector, action.text, { strict: true });
    return;
  }
  if (action.name === "setInputFiles") {
    await mainFrame.setInputFiles(progress, selector, { selector, payloads: [], strict: true });
    return;
  }
  if (action.name === "check") {
    await mainFrame.check(progress, selector, { strict: true });
    return;
  }
  if (action.name === "uncheck") {
    await mainFrame.uncheck(progress, selector, { strict: true });
    return;
  }
  if (action.name === "select") {
    const values = action.options.map((value) => ({ value }));
    await mainFrame.selectOption(progress, selector, [], values, { strict: true });
    return;
  }
  if (action.name === "assertChecked") {
    await mainFrame.expect(progress, selector, {
      selector,
      expression: "to.be.checked",
      expectedValue: { checked: action.checked },
      isNot: !action.checked
    });
    return;
  }
  if (action.name === "assertText") {
    await mainFrame.expect(progress, selector, {
      selector,
      expression: "to.have.text",
      expectedText: serializeExpectedTextValues([action.text], { matchSubstring: true, normalizeWhiteSpace: true }),
      isNot: false
    });
    return;
  }
  if (action.name === "assertValue") {
    await mainFrame.expect(progress, selector, {
      selector,
      expression: "to.have.value",
      expectedValue: action.value,
      isNot: false
    });
    return;
  }
  if (action.name === "assertVisible") {
    await mainFrame.expect(progress, selector, {
      selector,
      expression: "to.be.visible",
      isNot: false
    });
    return;
  }
  throw new Error("Internal error: unexpected action " + action.name);
}
function toClickOptions(action) {
  const modifiers = toKeyboardModifiers(action.modifiers);
  const options = {};
  if (action.button !== "left")
    options.button = action.button;
  if (modifiers.length)
    options.modifiers = modifiers;
  if (action.clickCount > 1)
    options.clickCount = action.clickCount;
  if (action.position)
    options.position = action.position;
  return options;
}

export { performAction, toClickOptions };
