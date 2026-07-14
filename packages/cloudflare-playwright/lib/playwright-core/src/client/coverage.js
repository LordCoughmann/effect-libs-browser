class Coverage {
  constructor(channel) {
    this._channel = channel;
  }
  async startJSCoverage(options = {}) {
    await this._channel.startJSCoverage(options);
  }
  async stopJSCoverage() {
    return (await this._channel.stopJSCoverage()).entries;
  }
  async startCSSCoverage(options = {}) {
    await this._channel.startCSSCoverage(options);
  }
  async stopCSSCoverage() {
    return (await this._channel.stopCSSCoverage()).entries;
  }
}

export { Coverage };
