import { ChannelOwner } from './channelOwner.js';
import { Events } from './events.js';
import { Page } from './page.js';

class PageAgent extends ChannelOwner {
  static from(channel) {
    return channel._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._page = Page.from(initializer.page);
    this._channel.on("turn", (params) => this.emit(Events.PageAgent.Turn, params));
  }
  async expect(expectation, options = {}) {
    const timeout = options.timeout ?? this._expectTimeout ?? 5e3;
    await this._channel.expect({ expectation, ...options, timeout });
  }
  async perform(task, options = {}) {
    const timeout = this._page._timeoutSettings.timeout(options);
    const { usage } = await this._channel.perform({ task, ...options, timeout });
    return { usage };
  }
  async extract(query, schema, options = {}) {
    const timeout = this._page._timeoutSettings.timeout(options);
    const { result, usage } = await this._channel.extract({ query, schema: this._page._platform.zodToJsonSchema(schema), ...options, timeout });
    return { result, usage };
  }
  async usage() {
    const { usage } = await this._channel.usage({});
    return usage;
  }
  async dispose() {
    await this._channel.dispose();
  }
  async [Symbol.asyncDispose]() {
    await this.dispose();
  }
}

export { PageAgent };
