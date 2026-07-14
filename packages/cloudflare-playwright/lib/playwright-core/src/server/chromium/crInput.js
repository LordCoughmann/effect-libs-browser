import { isString } from '../../utils/isomorphic/stringUtils.js';
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
import { keypadLocation } from '../input.js';
import { macEditingCommands } from '../macEditingCommands.js';
import { toModifiersMask, toButtonsMask } from './crProtocolHelper.js';

class RawKeyboardImpl {
  constructor(_client, _isMac, _dragManger) {
    this._client = _client;
    this._isMac = _isMac;
    this._dragManger = _dragManger;
  }
  _commandsForCode(code, modifiers) {
    if (!this._isMac)
      return [];
    const parts = [];
    for (const modifier of ["Shift", "Control", "Alt", "Meta"]) {
      if (modifiers.has(modifier))
        parts.push(modifier);
    }
    parts.push(code);
    const shortcut = parts.join("+");
    let commands = macEditingCommands[shortcut] || [];
    if (isString(commands))
      commands = [commands];
    commands = commands.filter((x) => !x.startsWith("insert"));
    return commands.map((c) => c.substring(0, c.length - 1));
  }
  async keydown(progress, modifiers, keyName, description, autoRepeat) {
    const { code, key, location, text } = description;
    if (code === "Escape" && await progress.race(this._dragManger.cancelDrag()))
      return;
    const commands = this._commandsForCode(code, modifiers);
    await progress.race(this._client.send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      modifiers: toModifiersMask(modifiers),
      windowsVirtualKeyCode: description.keyCodeWithoutLocation,
      code,
      commands,
      key,
      text,
      unmodifiedText: text,
      autoRepeat,
      location,
      isKeypad: location === keypadLocation
    }));
  }
  async keyup(progress, modifiers, keyName, description) {
    const { code, key, location } = description;
    await progress.race(this._client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers: toModifiersMask(modifiers),
      key,
      windowsVirtualKeyCode: description.keyCodeWithoutLocation,
      code,
      location
    }));
  }
  async sendText(progress, text) {
    await progress.race(this._client.send("Input.insertText", { text }));
  }
}
class RawMouseImpl {
  constructor(page, client, dragManager) {
    this._page = page;
    this._client = client;
    this._dragManager = dragManager;
  }
  async move(progress, x, y, button, buttons, modifiers, forClick) {
    const actualMove = async () => {
      await progress.race(this._client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        button,
        buttons: toButtonsMask(buttons),
        x,
        y,
        modifiers: toModifiersMask(modifiers),
        force: buttons.size > 0 ? 0.5 : 0
      }));
    };
    if (forClick) {
      await actualMove();
      return;
    }
    await this._dragManager.interceptDragCausedByMove(progress, x, y, button, buttons, modifiers, actualMove);
  }
  async down(progress, x, y, button, buttons, modifiers, clickCount) {
    if (this._dragManager.isDragging())
      return;
    await progress.race(this._client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button,
      buttons: toButtonsMask(buttons),
      x,
      y,
      modifiers: toModifiersMask(modifiers),
      clickCount,
      force: buttons.size > 0 ? 0.5 : 0
    }));
  }
  async up(progress, x, y, button, buttons, modifiers, clickCount) {
    if (this._dragManager.isDragging()) {
      await this._dragManager.drop(progress, x, y, modifiers);
      return;
    }
    await progress.race(this._client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button,
      buttons: toButtonsMask(buttons),
      x,
      y,
      modifiers: toModifiersMask(modifiers),
      clickCount
    }));
  }
  async wheel(progress, x, y, buttons, modifiers, deltaX, deltaY) {
    await progress.race(this._client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      modifiers: toModifiersMask(modifiers),
      deltaX,
      deltaY
    }));
  }
}
class RawTouchscreenImpl {
  constructor(client) {
    this._client = client;
  }
  async tap(progress, x, y, modifiers) {
    await progress.race(Promise.all([
      this._client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        modifiers: toModifiersMask(modifiers),
        touchPoints: [{
          x,
          y
        }]
      }),
      this._client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        modifiers: toModifiersMask(modifiers),
        touchPoints: []
      })
    ]));
  }
}

export { RawKeyboardImpl, RawMouseImpl, RawTouchscreenImpl };
