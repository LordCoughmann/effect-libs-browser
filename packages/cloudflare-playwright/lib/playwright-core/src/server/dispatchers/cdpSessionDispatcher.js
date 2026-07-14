import { Dispatcher } from './dispatcher.js';
import { CDPSession } from '../chromium/crConnection.js';

class CDPSessionDispatcher extends Dispatcher {
  constructor(scope, cdpSession) {
    super(scope, cdpSession, "CDPSession", {});
    this._type_CDPSession = true;
    this.addObjectListener(CDPSession.Events.Event, ({ method, params }) => this._dispatchEvent("event", { method, params }));
    this.addObjectListener(CDPSession.Events.Closed, () => this._dispose());
  }
  async send(params, progress) {
    return { result: await progress.race(this._object.send(params.method, params.params)) };
  }
  async detach(_, progress) {
    progress.metadata.potentiallyClosesScope = true;
    await this._object.detach();
  }
}

export { CDPSessionDispatcher };
