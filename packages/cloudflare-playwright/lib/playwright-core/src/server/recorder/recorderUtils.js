import { renderTitleForCall } from '../../utils/isomorphic/protocolFormatter.js';
import { quoteCSSAttributeValue } from '../../utils/isomorphic/stringUtils.js';
import { monotonicTime } from '../../utils/isomorphic/time.js';
import { raceAgainstDeadline } from '../../utils/isomorphic/timeoutRunner.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import '../utils/expectUtils.js';
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

function buildFullSelector(framePath, selector) {
  return [...framePath, selector].join(" >> internal:control=enter-frame >> ");
}
function metadataToCallLog(metadata, status) {
  const title = renderTitleForCall(metadata);
  if (metadata.error)
    status = "error";
  const params = {
    url: metadata.params?.url,
    selector: metadata.params?.selector
  };
  let duration = metadata.endTime ? metadata.endTime - metadata.startTime : void 0;
  if (typeof duration === "number" && metadata.pauseStartTime && metadata.pauseEndTime) {
    duration -= metadata.pauseEndTime - metadata.pauseStartTime;
    duration = Math.max(duration, 0);
  }
  const callLog = {
    id: metadata.id,
    messages: metadata.log,
    title: title ?? "",
    status,
    error: metadata.error?.error?.message,
    params,
    duration
  };
  return callLog;
}
function mainFrameForAction(pageAliases, actionInContext) {
  const pageAlias = actionInContext.frame.pageAlias;
  const page = [...pageAliases.entries()].find(([, alias]) => pageAlias === alias)?.[0];
  if (!page)
    throw new Error(`Internal error: page ${pageAlias} not found in [${[...pageAliases.values()]}]`);
  return page.mainFrame();
}
function isSameAction(a, b) {
  return a.action.name === b.action.name && a.frame.pageAlias === b.frame.pageAlias && a.frame.framePath.join("|") === b.frame.framePath.join("|");
}
function isSameSelector(action, lastAction) {
  return "selector" in action.action && "selector" in lastAction.action && action.action.selector === lastAction.action.selector;
}
function isShortlyAfter(action, lastAction) {
  return action.startTime - lastAction.startTime < 500;
}
function shouldMergeAction(action, lastAction) {
  if (!lastAction)
    return false;
  switch (action.action.name) {
    case "fill":
      return isSameAction(action, lastAction) && isSameSelector(action, lastAction);
    case "navigate":
      return isSameAction(action, lastAction);
    case "click":
      return isSameAction(action, lastAction) && isSameSelector(action, lastAction) && isShortlyAfter(action, lastAction) && action.action.clickCount > lastAction.action.clickCount;
  }
  return false;
}
function collapseActions(actions) {
  const result = [];
  for (const action of actions) {
    const lastAction = result[result.length - 1];
    const shouldMerge = shouldMergeAction(action, lastAction);
    if (!shouldMerge) {
      result.push(action);
      continue;
    }
    const startTime = result[result.length - 1].startTime;
    result[result.length - 1] = action;
    result[result.length - 1].startTime = startTime;
  }
  return result;
}
async function generateFrameSelector(frame) {
  const selectorPromises = [];
  while (frame) {
    const parent = frame.parentFrame();
    if (!parent)
      break;
    selectorPromises.push(generateFrameSelectorInParent(parent, frame));
    frame = parent;
  }
  const result = await Promise.all(selectorPromises);
  return result.reverse();
}
async function generateFrameSelectorInParent(parent, frame) {
  const result = await raceAgainstDeadline(async () => {
    try {
      const frameElement = await frame.frameElement();
      if (!frameElement || !parent)
        return;
      const utility = await parent._utilityContext();
      const injected = await utility.injectedScript();
      const selector = await injected.evaluate((injected2, element) => {
        return injected2.generateSelectorSimple(element);
      }, frameElement);
      return selector;
    } catch (e) {
    }
  }, monotonicTime() + 2e3);
  if (!result.timedOut && result.result)
    return result.result;
  if (frame.name())
    return `iframe[name=${quoteCSSAttributeValue(frame.name())}]`;
  return `iframe[src=${quoteCSSAttributeValue(frame.url())}]`;
}

export { buildFullSelector, collapseActions, generateFrameSelector, mainFrameForAction, metadataToCallLog, shouldMergeAction };
