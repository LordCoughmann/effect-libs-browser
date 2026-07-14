class Clock {
  constructor(browserContext) {
    this._browserContext = browserContext;
  }
  async install(options = {}) {
    await this._browserContext._channel.clockInstall(options.time !== void 0 ? parseTime(options.time) : {});
  }
  async fastForward(ticks) {
    await this._browserContext._channel.clockFastForward(parseTicks(ticks));
  }
  async pauseAt(time) {
    await this._browserContext._channel.clockPauseAt(parseTime(time));
  }
  async resume() {
    await this._browserContext._channel.clockResume({});
  }
  async runFor(ticks) {
    await this._browserContext._channel.clockRunFor(parseTicks(ticks));
  }
  async setFixedTime(time) {
    await this._browserContext._channel.clockSetFixedTime(parseTime(time));
  }
  async setSystemTime(time) {
    await this._browserContext._channel.clockSetSystemTime(parseTime(time));
  }
}
function parseTime(time) {
  if (typeof time === "number")
    return { timeNumber: time };
  if (typeof time === "string")
    return { timeString: time };
  if (!isFinite(time.getTime()))
    throw new Error(`Invalid date: ${time}`);
  return { timeNumber: time.getTime() };
}
function parseTicks(ticks) {
  return {
    ticksNumber: typeof ticks === "number" ? ticks : void 0,
    ticksString: typeof ticks === "string" ? ticks : void 0
  };
}

export { Clock };
