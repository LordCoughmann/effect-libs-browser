import { toModifiersMask } from './crProtocolHelper.js';
import { assert } from '../../utils/isomorphic/assert.js';
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

class DragManager {
  constructor(page) {
    this._dragState = null;
    this._lastPosition = { x: 0, y: 0 };
    this._crPage = page;
  }
  async cancelDrag() {
    if (!this._dragState)
      return false;
    await this._crPage._mainFrameSession._client.send("Input.dispatchDragEvent", {
      type: "dragCancel",
      x: this._lastPosition.x,
      y: this._lastPosition.y,
      data: {
        items: [],
        dragOperationsMask: 65535
      }
    });
    this._dragState = null;
    return true;
  }
  async interceptDragCausedByMove(progress, x, y, button, buttons, modifiers, moveCallback) {
    this._lastPosition = { x, y };
    if (this._dragState) {
      await progress.race(this._crPage._mainFrameSession._client.send("Input.dispatchDragEvent", {
        type: "dragOver",
        x,
        y,
        data: this._dragState,
        modifiers: toModifiersMask(modifiers)
      }));
      return;
    }
    if (button !== "left")
      return moveCallback();
    const client = this._crPage._mainFrameSession._client;
    let onDragIntercepted;
    const dragInterceptedPromise = new Promise((x2) => onDragIntercepted = x2);
    function setupDragListeners() {
      let didStartDrag = Promise.resolve(false);
      let dragEvent = null;
      const dragListener = (event) => dragEvent = event;
      const mouseListener = () => {
        didStartDrag = new Promise((callback) => {
          window.addEventListener("dragstart", dragListener, { once: true, capture: true });
          setTimeout(() => callback(dragEvent ? !dragEvent.defaultPrevented : false), 0);
        });
      };
      window.addEventListener("mousemove", mouseListener, { once: true, capture: true });
      window.__cleanupDrag = async () => {
        const val = await didStartDrag;
        window.removeEventListener("mousemove", mouseListener, { capture: true });
        window.removeEventListener("dragstart", dragListener, { capture: true });
        delete window.__cleanupDrag;
        return val;
      };
    }
    try {
      let expectingDrag = false;
      const scriptSource = `((__name => (${setupDragListeners.toString()}))(t => t))`;
      await progress.race(this._crPage._page.safeNonStallingEvaluateInAllFrames(`(${scriptSource})()`, "utility"));
      client.on("Input.dragIntercepted", onDragIntercepted);
      await client.send("Input.setInterceptDrags", { enabled: true });
      try {
        await progress.race(moveCallback());
        expectingDrag = (await Promise.all(this._crPage._page.frames().map(async (frame) => {
          return frame.nonStallingEvaluateInExistingContext("window.__cleanupDrag?.()", "utility").catch(() => false);
        }))).some((x2) => x2);
      } finally {
        client.off("Input.dragIntercepted", onDragIntercepted);
        await client.send("Input.setInterceptDrags", { enabled: false });
      }
      this._dragState = expectingDrag ? (await dragInterceptedPromise).data : null;
    } catch (error) {
      this._crPage._page.safeNonStallingEvaluateInAllFrames("window.__cleanupDrag?.()", "utility").catch(() => {
      });
      throw error;
    }
    if (this._dragState) {
      await progress.race(this._crPage._mainFrameSession._client.send("Input.dispatchDragEvent", {
        type: "dragEnter",
        x,
        y,
        data: this._dragState,
        modifiers: toModifiersMask(modifiers)
      }));
    }
  }
  isDragging() {
    return !!this._dragState;
  }
  async drop(progress, x, y, modifiers) {
    assert(this._dragState, "missing drag state");
    await progress.race(this._crPage._mainFrameSession._client.send("Input.dispatchDragEvent", {
      type: "drop",
      x,
      y,
      data: this._dragState,
      modifiers: toModifiersMask(modifiers)
    }));
    this._dragState = null;
  }
}

export { DragManager };
