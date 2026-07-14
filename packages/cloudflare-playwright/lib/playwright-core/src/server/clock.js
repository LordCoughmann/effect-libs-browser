import { source } from '../generated/clockSource.js';

class Clock {
  constructor(browserContext) {
    this._initScripts = [];
    this._browserContext = browserContext;
  }
  async uninstall(progress) {
    await progress.race(this._browserContext.removeInitScripts(this._initScripts));
    this._initScripts = [];
  }
  async fastForward(progress, ticks) {
    await this._installIfNeeded(progress);
    const ticksMillis = parseTicks(ticks);
    this._initScripts.push(await this._browserContext.addInitScript(progress, `globalThis.__pwClock.controller.log('fastForward', ${Date.now()}, ${ticksMillis})`));
    await progress.race(this._evaluateInFrames(`globalThis.__pwClock.controller.fastForward(${ticksMillis})`));
  }
  async install(progress, time) {
    await this._installIfNeeded(progress);
    const timeMillis = time !== void 0 ? parseTime(time) : Date.now();
    this._initScripts.push(await this._browserContext.addInitScript(progress, `globalThis.__pwClock.controller.log('install', ${Date.now()}, ${timeMillis})`));
    await progress.race(this._evaluateInFrames(`globalThis.__pwClock.controller.install(${timeMillis})`));
  }
  async pauseAt(progress, ticks) {
    await this._installIfNeeded(progress);
    const timeMillis = parseTime(ticks);
    this._initScripts.push(await this._browserContext.addInitScript(progress, `globalThis.__pwClock.controller.log('pauseAt', ${Date.now()}, ${timeMillis})`));
    await progress.race(this._evaluateInFrames(`globalThis.__pwClock.controller.pauseAt(${timeMillis})`));
  }
  resumeNoReply() {
    if (!this._initScripts.length)
      return;
    const doResume = async () => {
      this._initScripts.push(await this._browserContext.addInitScript(void 0, `globalThis.__pwClock.controller.log('resume', ${Date.now()})`));
      await this._evaluateInFrames(`globalThis.__pwClock.controller.resume()`);
    };
    doResume().catch(() => {
    });
  }
  async resume(progress) {
    await this._installIfNeeded(progress);
    this._initScripts.push(await this._browserContext.addInitScript(progress, `globalThis.__pwClock.controller.log('resume', ${Date.now()})`));
    await progress.race(this._evaluateInFrames(`globalThis.__pwClock.controller.resume()`));
  }
  async setFixedTime(progress, time) {
    await this._installIfNeeded(progress);
    const timeMillis = parseTime(time);
    this._initScripts.push(await this._browserContext.addInitScript(progress, `globalThis.__pwClock.controller.log('setFixedTime', ${Date.now()}, ${timeMillis})`));
    await progress.race(this._evaluateInFrames(`globalThis.__pwClock.controller.setFixedTime(${timeMillis})`));
  }
  async setSystemTime(progress, time) {
    await this._installIfNeeded(progress);
    const timeMillis = parseTime(time);
    this._initScripts.push(await this._browserContext.addInitScript(progress, `globalThis.__pwClock.controller.log('setSystemTime', ${Date.now()}, ${timeMillis})`));
    await progress.race(this._evaluateInFrames(`globalThis.__pwClock.controller.setSystemTime(${timeMillis})`));
  }
  async runFor(progress, ticks) {
    await this._installIfNeeded(progress);
    const ticksMillis = parseTicks(ticks);
    this._initScripts.push(await this._browserContext.addInitScript(progress, `globalThis.__pwClock.controller.log('runFor', ${Date.now()}, ${ticksMillis})`));
    await progress.race(this._evaluateInFrames(`globalThis.__pwClock.controller.runFor(${ticksMillis})`));
  }
  async _installIfNeeded(progress) {
    if (this._initScripts.length)
      return;
    const script = `(() => {
      const module = {};
      ${source}
      if (!globalThis.__pwClock)
        globalThis.__pwClock = (module.exports.inject())(globalThis);
    })();`;
    const initScript = await this._browserContext.addInitScript(progress, script);
    await progress.race(this._evaluateInFrames(script));
    this._initScripts.push(initScript);
  }
  async _evaluateInFrames(script) {
    await this._browserContext.safeNonStallingEvaluateInAllFrames(script, "main", { throwOnJSErrors: true });
  }
}
function parseTicks(value) {
  if (typeof value === "number")
    return value;
  if (!value)
    return 0;
  const str = value;
  const strings = str.split(":");
  const l = strings.length;
  let i = l;
  let ms = 0;
  let parsed;
  if (l > 3 || !/^(\d\d:){0,2}\d\d?$/.test(str)) {
    throw new Error(
      `Clock only understands numbers, 'mm:ss' and 'hh:mm:ss'`
    );
  }
  while (i--) {
    parsed = parseInt(strings[i], 10);
    if (parsed >= 60)
      throw new Error(`Invalid time ${str}`);
    ms += parsed * Math.pow(60, l - i - 1);
  }
  return ms * 1e3;
}
function parseTime(epoch) {
  if (!epoch)
    return 0;
  if (typeof epoch === "number")
    return epoch;
  const parsed = new Date(epoch);
  if (!isFinite(parsed.getTime()))
    throw new Error(`Invalid date: ${epoch}`);
  return parsed.getTime();
}

export { Clock };
